/**
 * tokenHelper.js - eBay user-level OAuth token retrieval for the Outpost Worker.
 *
 * Mirrors the getEbayUserToken function from landing/src/gateway/ebayOAuth.js,
 * operating against the Outpost's own D1 + JWT_SECRET bindings.
 *
 * Eliminates the server-to-server gateway fetch pattern that caused the
 * "Endpoint not found" loopback bug in find-listings.js.
 *
 * Required env bindings: DB, JWT_SECRET, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET
 * Optional: EBAY_ENV (set to 'sandbox' to use sandbox API URLs)
 */

// --- Token Crypto (AES-GCM, matches landing/src/gateway/tokenCrypto.js) ---

const SALT = new TextEncoder().encode('techtrekgt-ebay-token-v1');
const PBKDF2_ITERATIONS = 100_000;

async function deriveKey(secret) {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
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

async function decryptToken(encrypted, jwtSecret) {
  const [ivB64, cipherB64] = encrypted.split('.');
  if (!ivB64 || !cipherB64) throw new Error('Invalid encrypted token format');
  const key = await deriveKey(jwtSecret);
  const iv = base64ToBuf(ivB64);
  const cipherBuf = base64ToBuf(cipherB64);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}

async function encryptToken(plaintext, jwtSecret) {
  const key = await deriveKey(jwtSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${bufToBase64(iv)}.${bufToBase64(cipherBuf)}`;
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
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET binding not available');

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

  // Access token still valid (>5 min remaining) - return it directly
  if (accessExp > now + 5 * 60 * 1000) {
    return decryptToken(row.access_token, env.JWT_SECRET);
  }

  // Access token expired or near-expiry - refresh it
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) {
    throw new Error('EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not configured on this worker. Cannot refresh token.');
  }

  const refreshToken = await decryptToken(row.refresh_token, env.JWT_SECRET);
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
    throw new Error(`eBay token refresh failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const newExpMs = Date.now() + (data.expires_in || 7200) * 1000;
  const newExpIso = new Date(newExpMs).toISOString();

  const encAccess = await encryptToken(newAccessToken, env.JWT_SECRET);

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
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>100</EntriesPerPage>
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
        const getTag = (tag) => {
          const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
          if (!m) return null;
          let val = m[1].trim();
          const cdata = val.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
          return cdata ? cdata[1].trim() : val;
        };

        const listingId = getTag('ItemID');
        const title = getTag('Title');
        const currentPriceStr = getTag('CurrentPrice') || getTag('BuyItNowPrice') || '0';
        const qtyStr = getTag('QuantityAvailable') || getTag('Quantity') || '1';
        const sku = getTag('SKU') || null;

        if (listingId || title) {
          const key = listingId || sku || title;
          listingsMap.set(key, {
            sku: sku || null,
            listing_id: listingId || null,
            title: title || '',
            price: parseFloat(currentPriceStr) || 0,
            quantity: parseInt(qtyStr, 10) || 1,
            condition: 'Active',
            status: 'Active',
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
