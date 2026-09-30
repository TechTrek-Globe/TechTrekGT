import { requireGatewayAuth, withGatewayAuth, ok, err } from './guard.js';
import { encryptToken, decryptToken } from './tokenCrypto.js';
import { getEbayEndpoints, isEbaySandbox } from './ebay.js';

/**
 * eBay Authorization Code Grant (ACG) OAuth flow handlers.
 *
 * Routes:
 *   GET    /api/ebay/oauth/start       - Build eBay auth URL + PKCE state, redirect user
 *   GET    /api/ebay/oauth/callback    - Exchange auth code, store encrypted tokens in D1
 *   GET    /api/ebay/oauth/status      - Return connection status for the authenticated user
 *   DELETE /api/ebay/oauth/disconnect  - Revoke + delete token from D1
 *
 * Required env secrets: JWT_SECRET, EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REDIRECT_URI
 * Required bindings: GATEWAY_KV, DB
 */

const EBAY_ACG_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly'
].join(' ');

const KV_STATE_PREFIX = 'oauth_state_';
const KV_STATE_TTL = 600; // 10 minutes

function getAuthBaseUrl(env) {
  return isEbaySandbox(env)
    ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
    : 'https://auth.ebay.com/oauth2/authorize';
}

async function sha256B64(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function randomBase64Url(len = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function getClientId(env) {
  return String(env.EBAY_CLIENT_ID || '').trim().replace(/^['"]+|['"]+$/g, '');
}
function getClientSecret(env) {
  return String(env.EBAY_CLIENT_SECRET || '').trim().replace(/^['"]+|['"]+$/g, '');
}
function getRedirectUri(env) {
  return String(env.EBAY_RUNAME || env.EBAY_REDIRECT_URI || 'Jon_Kemp-JonKemp-TechTre-isiair').trim();
}

/**
 * Retrieves a valid user-level eBay access token.
 * Auto-refreshes if within 5min of expiry.
 * Throws if not connected or if refresh token is expired.
 *
 * Exported for use by ebayFinances.js, ebayListings.js, ebayOrders.js
 */
export async function getEbayUserToken(env, userId) {
  if (!env.DB) throw new Error('DB binding not available');

  if (!env.TOKEN_ENCRYPTION_KEY) {
    console.error('[ebayOAuth] FATAL: TOKEN_ENCRYPTION_KEY is not bound. eBay integration unavailable.');
    throw Object.assign(
      new Error('eBay integration is temporarily unavailable due to a server configuration issue. Please contact support.'),
      { statusCode: 503 }
    );
  }
  const encKey = env.TOKEN_ENCRYPTION_KEY;

  const row = await env.DB.prepare(
    'SELECT * FROM ebay_oauth_tokens WHERE user_id = ?'
  ).bind(userId).first();

  if (!row) throw new Error('eBay account not connected. Go to Settings > eBay Integration to connect.');

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
        await env.DB.prepare(
          `UPDATE ebay_oauth_tokens SET ${column} = ? WHERE user_id = ?`
        ).bind(reencrypted, userId).run();
        console.log(`[ebayOAuth] Migrated legacy ${column} to v2 envelope for user ${userId}`);
      } catch (migrateErr) {
        console.error(`[ebayOAuth] Failed to persist migrated ${column}:`, migrateErr);
      }
    }
    return plaintext;
  }

  // Token still valid (>5min remaining)
  if (accessExp > now + 5 * 60 * 1000) {
    return decryptAndMigrate(row.access_token, 'access_token');
  }

  // Need to refresh
  const refreshToken = await decryptAndMigrate(row.refresh_token, 'refresh_token');
  const { oauthUrl } = getEbayEndpoints(env);
  const credentials = btoa(`${getClientId(env)}:${getClientSecret(env)}`);

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
    console.error(`[ebayOAuth] eBay token refresh failed (${res.status}):`, text);
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

// --- Route Handlers ---

/**
 * GET /api/ebay/oauth/start
 * Builds eBay auth URL with standard Confidential Client parameters, stores state in KV, redirects user.
 */
export async function onRequestGetStart(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    const { userId } = await requireGatewayAuth(request, env);

    const redirectUri = getRedirectUri(env);
    if (!redirectUri) {
      return err('EBAY_RUNAME or EBAY_REDIRECT_URI secret is not configured in Cloudflare environment', 500);
    }

    const state = randomBase64Url(24);

    if (env.GATEWAY_KV) {
      await env.GATEWAY_KV.put(
        `${KV_STATE_PREFIX}${state}`,
        JSON.stringify({ userId }),
        { expirationTtl: KV_STATE_TTL }
      );
    }

    const params = new URLSearchParams({
      client_id: getClientId(env),
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: env.EBAY_SCOPES || EBAY_ACG_SCOPES,
      prompt: 'consent',
      state
    });

    const authUrl = `${getAuthBaseUrl(env)}?${params}`;
    return Response.redirect(authUrl, 302);
  });
}

/**
 * GET /api/ebay/oauth/callback
 * Exchanges auth code for tokens, stores encrypted tokens in D1, redirects to Outpost settings.
 */
export async function onRequestGetCallback(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const redirectBase = 'https://techtrekgt.com/outpost/settings';

  if (errorParam) {
    return Response.redirect(`${redirectBase}?ebay=error&reason=${encodeURIComponent(errorParam)}`, 302);
  }
  if (!code || !state) {
    return Response.redirect(`${redirectBase}?ebay=error&reason=missing_params`, 302);
  }

  try {
    if (!env.GATEWAY_KV || !env.DB) {
      return Response.redirect(`${redirectBase}?ebay=error&reason=server_config`, 302);
    }
    if (!env.TOKEN_ENCRYPTION_KEY) {
      console.error('[ebayOAuth callback] FATAL: TOKEN_ENCRYPTION_KEY not bound. Cannot store tokens.');
      return Response.redirect(`${redirectBase}?ebay=error&reason=server_config`, 302);
    }

    const stateData = await env.GATEWAY_KV.get(`${KV_STATE_PREFIX}${state}`, { type: 'json' });
    if (!stateData) {
      return Response.redirect(`${redirectBase}?ebay=error&reason=invalid_state`, 302);
    }
    await env.GATEWAY_KV.delete(`${KV_STATE_PREFIX}${state}`);

    const { userId } = stateData;
    const redirectUri = getRedirectUri(env);

    const { oauthUrl } = getEbayEndpoints(env);
    const credentials = btoa(`${getClientId(env)}:${getClientSecret(env)}`);

    const tokenRes = await fetch(oauthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: [
        `grant_type=authorization_code`,
        `code=${encodeURIComponent(code)}`,
        `redirect_uri=${encodeURIComponent(redirectUri)}`
      ].join('&')
    });

    if (!tokenRes.ok) {
      console.error('[ebayOAuth callback] token exchange failed:', tokenRes.status);
      return Response.redirect(`${redirectBase}?ebay=error&reason=token_exchange`, 302);
    }


    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    const accessExpMs = Date.now() + (tokenData.expires_in || 7200) * 1000;
    const refreshExpMs = Date.now() + (tokenData.refresh_token_expires_in || 47304000) * 1000;

    const encKey = env.TOKEN_ENCRYPTION_KEY;
    const [encAccess, encRefresh] = await Promise.all([
      encryptToken(accessToken, encKey),
      encryptToken(refreshToken, encKey)
    ]);

    // Fetch eBay username from identity endpoint
    let ebayUserId = null;
    try {
      const idRes = await fetch('https://apiz.ebay.com/commerce/identity/v1/user/', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (idRes.ok) {
        const idData = await idRes.json();
        ebayUserId = idData.userId || idData.username || null;
      }
    } catch (_) { /* non-fatal */ }

    await env.DB.prepare(`
      INSERT INTO ebay_oauth_tokens
        (id, user_id, access_token, refresh_token, access_token_exp, refresh_token_exp, scopes, ebay_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        access_token_exp = excluded.access_token_exp,
        refresh_token_exp = excluded.refresh_token_exp,
        scopes = excluded.scopes,
        ebay_user_id = excluded.ebay_user_id,
        last_refreshed_at = datetime('now')
    `).bind(
      crypto.randomUUID(),
      userId,
      encAccess,
      encRefresh,
      new Date(accessExpMs).toISOString(),
      new Date(refreshExpMs).toISOString(),
      tokenData.scope || EBAY_ACG_SCOPES,
      ebayUserId
    ).run();

    return Response.redirect(`${redirectBase}?ebay=connected`, 302);
  } catch (e) {
    console.error('[ebayOAuth callback] error:', e.message);
    return Response.redirect(`${redirectBase}?ebay=error&reason=server_error`, 302);
  }
}

/**
 * GET /api/ebay/oauth/status
 * Returns connection status for the authenticated user.
 */
export async function onRequestGetStatus(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    const { userId } = await requireGatewayAuth(request, env);
    if (!env.DB) return err('DB not available', 500);

    const row = await env.DB.prepare(
      'SELECT ebay_user_id, scopes, access_token_exp, refresh_token_exp, connected_at, last_refreshed_at FROM ebay_oauth_tokens WHERE user_id = ?'
    ).bind(userId).first();

    if (!row) return ok({ connected: false });

    const now = Date.now();
    const refreshExpMs = new Date(row.refresh_token_exp).getTime();
    const daysUntilExpiry = Math.floor((refreshExpMs - now) / (1000 * 60 * 60 * 24));

    return ok({
      connected: true,
      ebay_user_id: row.ebay_user_id,
      scopes: row.scopes,
      access_token_exp: row.access_token_exp,
      refresh_token_exp: row.refresh_token_exp,
      connected_at: row.connected_at,
      last_refreshed_at: row.last_refreshed_at,
      days_until_expiry: daysUntilExpiry,
      expiry_warning: daysUntilExpiry < 30
    });
  });
}

/**
 * Revokes the stored eBay refresh token at eBay (RFC 7009 token revocation).
 * Best-effort: an upstream revoke failure never blocks the local disconnect.
 * Returns true when eBay confirmed the revocation.
 */
async function revokeEbayToken(env, encryptedRefreshToken) {
  if (!encryptedRefreshToken) return false;
  if (!env.TOKEN_ENCRYPTION_KEY) {
    console.error('[ebayOAuth disconnect] TOKEN_ENCRYPTION_KEY not bound; cannot decrypt token for revocation. Skipping upstream revoke.');
    return false;
  }
  try {
    const encKey = env.TOKEN_ENCRYPTION_KEY;
    const { plaintext: refreshToken } = await decryptToken(encryptedRefreshToken, encKey);
    if (!refreshToken) return false;
    const { oauthUrl } = getEbayEndpoints(env);
    const credentials = btoa(`${getClientId(env)}:${getClientSecret(env)}`);

    const res = await fetch(`${oauthUrl}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: `token=${encodeURIComponent(refreshToken)}&token_type_hint=refresh_token`
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[ebayOAuth disconnect] eBay token revoke failed (${res.status}):`, text);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[ebayOAuth disconnect] eBay token revoke error:', e && e.message ? e.message : e);
    return false;
  }
}

/**
 * DELETE /api/ebay/oauth/disconnect
 * Revokes the eBay refresh token, then removes the token row for the authenticated user.
 */
export async function onRequestDelete(context) {
  const { request, env } = context;
  return withGatewayAuth(async () => {
    const { userId } = await requireGatewayAuth(request, env);
    if (!env.DB) return err('DB not available', 500);

    const row = await env.DB.prepare(
      'SELECT refresh_token FROM ebay_oauth_tokens WHERE user_id = ?'
    ).bind(userId).first();

    if (!row) {
      return ok({ disconnected: true, revoked: false, already_disconnected: true });
    }

    const revoked = await revokeEbayToken(env, row.refresh_token);

    await env.DB.prepare(
      'DELETE FROM ebay_oauth_tokens WHERE user_id = ?'
    ).bind(userId).run();

    return ok({ disconnected: true, revoked });
  });
}
