import { decryptToken, encryptToken } from './tokenCrypto.js';

/**
 * Retrieves a valid user-level eBay access token directly from D1.
 * Auto-refreshes if within 5min of expiry.
 */
export async function getEbayUserToken(env, userId) {
  if (!env.DB) throw new Error('DB binding not available');
  const encKey = env.TOKEN_ENCRYPTION_KEY || env.JWT_SECRET;
  if (!encKey) throw new Error('TOKEN_ENCRYPTION_KEY binding not available');

  const row = await env.DB.prepare(
    'SELECT * FROM ebay_oauth_tokens WHERE user_id = ?'
  ).bind(userId).first();

  if (!row) throw new Error('eBay account not connected. Go to Settings > Integrations to connect.');

  const now = Date.now();
  const accessExp = new Date(row.access_token_exp).getTime();
  const refreshExp = new Date(row.refresh_token_exp).getTime();

  if (refreshExp < now) {
    throw new Error('eBay refresh token has expired. Please reconnect your eBay account in Settings.');
  }

  // Token still valid (>5min remaining)
  if (accessExp > now + 5 * 60 * 1000) {
    return decryptToken(row.access_token, encKey, env.JWT_SECRET);
  }

  // If token is still not expired, use it
  if (accessExp > now) {
    return decryptToken(row.access_token, encKey, env.JWT_SECRET);
  }

  // Need to refresh
  const clientId = String(env.EBAY_CLIENT_ID || '').trim().replace(/^['"]+|['"]+$/g, '');
  const clientSecret = String(env.EBAY_CLIENT_SECRET || '').trim().replace(/^['"]+|['"]+$/g, '');
  if (!clientId || !clientSecret) {
    throw new Error('eBay client credentials (EBAY_CLIENT_ID/EBAY_CLIENT_SECRET) not configured in worker environment. Route requests via Central Gateway (techtrekgt.com/api/ebay/*).');
  }
  const refreshToken = await decryptToken(row.refresh_token, encKey, env.JWT_SECRET);
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
  });

  if (!res.ok) {
    // If refresh fails but token is still within validity window, return existing
    if (accessExp > now) {
      return decryptToken(row.access_token, encKey, env.JWT_SECRET);
    }
    const text = await res.text().catch(() => '');
    console.error(`[ebayAuth] eBay token refresh failed (${res.status}):`, text);
    throw new Error('eBay token refresh failed. Please reconnect your eBay account.');
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const newExpMs = Date.now() + (data.expires_in || 7200) * 1000;
  const newExpIso = new Date(newExpMs).toISOString();

  const encAccess = await encryptToken(newAccessToken, env.TOKEN_ENCRYPTION_KEY || encKey);

  await env.DB.prepare(`
    UPDATE ebay_oauth_tokens SET
      access_token = ?,
      access_token_exp = ?,
      last_refreshed_at = datetime('now')
    WHERE user_id = ?
  `).bind(encAccess, newExpIso, userId).run();

  return newAccessToken;
}
