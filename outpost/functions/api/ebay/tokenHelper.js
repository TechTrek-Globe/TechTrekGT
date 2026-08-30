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

        if (listingId || title) {
          const key = listingId || sku || title;
          listingsMap.set(key, {
            sku: sku || null,
            listing_id: listingId || null,
            title: title || '',
            price: parseFloat(currentPriceStr) || 0,
            quantity: parseInt(qtyStr, 10) || 1,
            buyer_shipping_cost: shipCost,
            is_free_shipping: freeShip || (shipCost === 0),
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

/**
 * Calculates eBay category-specific final value fee rate and flat fee.
 * 
 * Rules:
 * - Sports Trading Cards (Singles & Boxes / Lots): 13.25% + $0.30 (if total <= $10) or $0.40 (if total > $10)
 * - Books, Movies, Music: 14.95% + $0.40
 * - Select Consumer Electronics: 13.25% + $0.40 (or 9.35% for select subcategories)
 * - Sports Memorabilia / Standard Default: 13.50% + $0.40
 *
 * @param {string|null} categoryId
 * @param {string|null} categoryName
 * @param {number} currentPrice
 * @returns {{ fee_pct: number, flat_fee: number, category_tier: string }}
 */
export function calculateEbayCategoryFees(categoryId, categoryName, currentPrice = 0) {
  const catLower = (categoryName || '').toLowerCase();
  const idStr = String(categoryId || '');

  // 1. Sports Trading Cards & Collectible Card Games (IDs: 213, 214, 215, 216, 261328, 183454, 183050, etc.)
  if (
    catLower.includes('trading card') ||
    catLower.includes('baseball card') ||
    catLower.includes('football card') ||
    catLower.includes('basketball card') ||
    catLower.includes('hockey card') ||
    catLower.includes('soccer card') ||
    catLower.includes('pokemon') ||
    catLower.includes('magic: the gathering') ||
    ['213', '214', '215', '216', '261328', '183454', '183050', '261068'].includes(idStr)
  ) {
    return {
      fee_pct: 0.1325, // 13.25%
      flat_fee: currentPrice > 0 && currentPrice <= 10.0 ? 0.30 : 0.40,
      category_tier: 'Trading Cards (13.25%)'
    };
  }

  // 2. Books, Movies & Music (IDs: 267, 11232, 11233, etc.)
  if (
    catLower.includes('books & magazines') ||
    catLower.includes('dvds & movies') ||
    catLower.includes('music') ||
    ['267', '11232', '11233', '176984'].includes(idStr)
  ) {
    return {
      fee_pct: 0.1495, // 14.95%
      flat_fee: 0.40,
      category_tier: 'Media / Books (14.95%)'
    };
  }

  // 3. Select Consumer Electronics (IDs: 9355, 175672, 177, etc.)
  if (
    catLower.includes('computers/tablets') ||
    catLower.includes('cell phones & smartphones') ||
    ['9355', '175672', '177'].includes(idStr)
  ) {
    return {
      fee_pct: 0.1325,
      flat_fee: 0.40,
      category_tier: 'Electronics (13.25%)'
    };
  }

  // 4. Default: Sports Memorabilia, Fan Apparel, Antiques & General Merchandise
  return {
    fee_pct: 0.1350, // 13.50%
    flat_fee: 0.40,
    category_tier: 'Standard / Sports Mem (13.50%)'
  };
}

/**
 * Fetches expanded details for a single eBay listing by its 12-digit ItemID.
 * Queries the eBay Trading API (GetItem) with ReturnAll detail level.
 *
 * @param {object} env
 * @param {string} accessToken
 * @param {string} listingId - 12-digit eBay ItemID
 * @returns {Promise<object|null>} Expanded listing details object
 */
export async function fetchSingleEbayListing(env, accessToken, listingId) {
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
      const getTag = (tag, src = xmlText) => {
        const m = src.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        if (!m) return null;
        let val = m[1].trim();
        const cdata = val.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
        return cdata ? cdata[1].trim() : val;
      };

      const itemId = getTag('ItemID');
      const title = getTag('Title');
      const currentPriceStr = getTag('CurrentPrice') || getTag('BuyItNowPrice') || '0';
      const price = parseFloat(currentPriceStr) || 0;
      const startTime = getTag('StartTime');
      const listingStatus = getTag('ListingStatus') || 'Active';
      const qtyStr = getTag('QuantityAvailable') || getTag('Quantity') || '1';
      const qtySoldStr = getTag('QuantitySold') || '0';
      const sku = getTag('SKU') || null;
      const listingType = getTag('ListingType') || 'FixedPriceItem';

      // Category details
      const categoryId = getTag('CategoryID');
      const categoryName = getTag('CategoryName');
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
        const n = getTag('Name', block);
        const v = getTag('Value', block);
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

      // 1. Check Trading API response XML for any embedded ad rate / promoted rate tags
      const xmlRateMatch = xmlText.match(/<(?:BidPercentage|AdRate|PromotedRate|AdPercentage)[^>]*>([0-9.]+)<\/(?:BidPercentage|AdRate|PromotedRate|AdPercentage)>/i) ||
                           xmlText.match(/<PromotedListing[^>]*>[\s\S]*?<BidPercentage[^>]*>([0-9.]+)<\/BidPercentage>/i);
      if (xmlRateMatch) {
        const r = parseFloat(xmlRateMatch[1]);
        if (r > 0) autoPromotedRate = r;
      }

      // 2. Query eBay Marketing API
      if (autoPromotedRate == null) {
        try {
          const mktBase = isSandbox ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
          const campRes = await fetch(`${mktBase}/sell/marketing/v1/ad_campaign?limit=50`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          });

          if (campRes.ok) {
            const campData = await campRes.json();
            const campaigns = campData.campaigns || [];

            for (const camp of campaigns) {
              if (!camp.campaignId) continue;

              // Query campaign ads for this specific listing ID
              try {
                const adRes = await fetch(`${mktBase}/sell/marketing/v1/ad_campaign/${camp.campaignId}/ad?listing_ids=${cleanId}`, {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                  }
                });
                if (adRes.ok) {
                  const adData = await adRes.json();
                  const ads = adData.ads || [];
                  const matchedAd = ads.find(a => String(a.listingId) === cleanId) || ads[0];
                  if (matchedAd?.bidPercentage) {
                    const r = parseFloat(matchedAd.bidPercentage);
                    if (r > 0) { autoPromotedRate = r; break; }
                  }
                }
              } catch (_) {}

              // Also check campaign ads collection or funding strategy
              if (autoPromotedRate == null) {
                try {
                  const checkAds = await fetch(`${mktBase}/sell/marketing/v1/ad_campaign/${camp.campaignId}/ad?limit=100`, {
                    headers: {
                      Authorization: `Bearer ${accessToken}`,
                      Accept: 'application/json',
                      'Content-Type': 'application/json'
                    }
                  });
                  if (checkAds.ok) {
                    const checkData = await checkAds.json();
                    const specificAd = (checkData.ads || []).find(a => String(a.listingId) === cleanId);
                    if (specificAd?.bidPercentage) {
                      const r = parseFloat(specificAd.bidPercentage);
                      if (r > 0) { autoPromotedRate = r; break; }
                    }
                  }
                } catch (_) {}
              }

              // Fallback to campaign funding strategy bidPercentage (e.g. campaign-level 7.0%)
              if (autoPromotedRate == null && camp.fundingStrategy?.bidPercentage) {
                const r = parseFloat(camp.fundingStrategy.bidPercentage);
                if (r > 0) {
                  autoPromotedRate = r;
                  break;
                }
              }
            }

            // If still null and there's exactly 1 campaign with a valid fundingStrategy rate, use it
            if (autoPromotedRate == null && campaigns.length > 0) {
              const candidate = campaigns.find(c => c.fundingStrategy?.bidPercentage && parseFloat(c.fundingStrategy.bidPercentage) > 0);
              if (candidate) {
                autoPromotedRate = parseFloat(candidate.fundingStrategy.bidPercentage);
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


