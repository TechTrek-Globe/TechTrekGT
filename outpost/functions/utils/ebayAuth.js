import { decryptToken, encryptToken } from './tokenCrypto.js';

// Startup-time binding presence log (value is never logged)
if (typeof console !== 'undefined') {
  // This module is imported once per isolate warm-up.
  // We log presence/absence only - never the key value or its length.
  console.log('[ebayAuth] TOKEN_ENCRYPTION_KEY binding present at module load: will be checked per-call');
}

/**
 * Retrieves a valid user-level eBay access token directly from D1.
 * Auto-refreshes if within 5min of expiry.
 *
 * FAIL-CLOSED: If TOKEN_ENCRYPTION_KEY is not bound, throws an error that maps
 * to 503 at the handler level. JWT_SECRET is NEVER substituted.
 */
export async function getEbayUserToken(env, userId) {
  if (!env.DB) throw new Error('DB binding not available');

  if (!env.TOKEN_ENCRYPTION_KEY) {
    console.error('[ebayAuth] FATAL: TOKEN_ENCRYPTION_KEY is not bound. eBay integration unavailable.');
    throw Object.assign(
      new Error('eBay integration is temporarily unavailable due to a server configuration issue. Please contact support.'),
      { statusCode: 503 }
    );
  }
  const encKey = env.TOKEN_ENCRYPTION_KEY;

  console.log(`[ebayAuth] TOKEN_ENCRYPTION_KEY binding present: yes`);

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

  // Helper: decrypt and re-encrypt legacy tokens in-place
  async function decryptAndMigrate(encrypted, column) {
    const { plaintext, wasLegacy } = await decryptToken(encrypted, encKey);
    if (wasLegacy && plaintext) {
      try {
        const reencrypted = await encryptToken(plaintext, encKey);
        const stmt = column === 'access_token'
          ? env.DB.prepare('UPDATE ebay_oauth_tokens SET access_token = ? WHERE user_id = ?')
          : env.DB.prepare('UPDATE ebay_oauth_tokens SET refresh_token = ? WHERE user_id = ?');
        await stmt.bind(reencrypted, userId).run();
        console.log(`[ebayAuth] Migrated legacy ${column} to v2 envelope for user ${userId}`);
      } catch (migrateErr) {
        console.error(`[ebayAuth] Failed to persist migrated ${column}:`, migrateErr);
        // Non-fatal: continue with the decrypted plaintext
      }
    }
    return plaintext;
  }

  // Token still valid (>5min remaining)
  if (accessExp > now + 5 * 60 * 1000) {
    return decryptAndMigrate(row.access_token, 'access_token');
  }

  // If token is still not expired but within 5min window, use it
  if (accessExp > now) {
    return decryptAndMigrate(row.access_token, 'access_token');
  }

  // Need to refresh
  const clientId = String(env.EBAY_CLIENT_ID || '').trim().replace(/^['\"]+|['\"]+$/g, '');
  const clientSecret = String(env.EBAY_CLIENT_SECRET || '').trim().replace(/^['\"]+|['\"]+$/g, '');
  if (!clientId || !clientSecret) {
    throw new Error('eBay client credentials (EBAY_CLIENT_ID/EBAY_CLIENT_SECRET) not configured in worker environment. Route requests via Central Gateway (techtrekgt.com/api/ebay/*).');
  }
  const refreshToken = await decryptAndMigrate(row.refresh_token, 'refresh_token');
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
    // If refresh fails but access token is still within validity window, return existing
    if (accessExp > now) {
      const { plaintext } = await decryptToken(row.access_token, encKey);
      return plaintext;
    }
    const text = await res.text().catch(() => '');
    console.error(`[ebayAuth] eBay token refresh failed (${res.status}):`, text);
    if (res.status === 400 || res.status === 401) {
      await env.DB.prepare('DELETE FROM ebay_oauth_tokens WHERE user_id = ?').bind(userId).run();
    }
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
