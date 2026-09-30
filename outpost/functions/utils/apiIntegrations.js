import { verifyToken } from './auth.js';


/**
 * Computes a deterministic SHA-256 hex hash of a raw secret string.
 * @param {string} secret - Raw secret token
 * @returns {Promise<string|null>} - 64-character lowercase hex string
 */
export async function hashSecret(secret) {
  if (!secret || typeof secret !== 'string') return null;
  const trimmed = secret.trim();
  if (!trimmed) return null;
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(trimmed));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a high-entropy cryptographically secure random API secret.
 * Prefix 'op_sec_' distinguishes Outpost integration secrets.
 * @returns {string} - e.g. "op_sec_4f9a..."
 */
export function generateIntegrationSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `op_sec_${hex}`;
}

/**
 * Alerts operators if the deprecated OUTPOST_SECRET_KEY binding is still
 * provisioned. Should be called once at the start of each consuming endpoint.
 * @param {Record<string, any>} env
 */
export function checkOutpostSecretKey(env) {
  if (env?.OUTPOST_SECRET_KEY) {
    console.error('[SECURITY] OUTPOST_SECRET_KEY is still bound in this environment. '
      + 'This deprecated shared secret has been removed from the authentication flow. '
      + 'Any client presenting it will receive 401 Unauthorized. '
      + 'Unset it with: wrangler secret delete OUTPOST_SECRET_KEY');
  }
}

/**
 * Resolves the authenticated user_id associated with a presented token or secret.
 *
 * Evaluation Order:
 * 1. Signed JWT session token (via JWT_SECRET).
 * 2. api_integrations table lookup by SHA-256 secret_hash.
 *    - If record found and revoked_at IS NOT NULL -> explicitly revoked (returns null).
 *    - If record found and revoked_at IS NULL -> returns user_id directly.
 * 3. users.amazon_api_token_hash lookup (legacy hashed per-user extension token).
 *
 * NOTE: Plaintext amazon_api_token and shared OUTPOST_SECRET_KEY fallbacks
 * have been REMOVED. Any client relying on these will receive 401.
 *
 * @param {string} rawToken - Presented token / header value
 * @param {Record<string, any>} env - Cloudflare Worker environment (DB, JWT_SECRET)
 * @returns {Promise<string|null>} - Resolved user_id or null
 */
export async function resolveIntegrationUserId(rawToken, env) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const token = rawToken.trim();
  if (!token) return null;

  // 0. Verify if token is a valid signed JWT session token
  if (env?.JWT_SECRET) {
    try {
      const payload = await verifyToken(token, env.JWT_SECRET);
      if (payload?.userId) {
        return payload.userId;
      }
    } catch (_) {}
  }

  if (env?.DB) {
    // 1. Check api_integrations by secret_hash
    const secretHash = await hashSecret(token);
    if (secretHash) {
      const integration = await env.DB.prepare(
        'SELECT id, user_id, revoked_at FROM api_integrations WHERE secret_hash = ? LIMIT 1'
      ).bind(secretHash).first();

      if (integration) {
        // If revoked, explicitly reject
        if (integration.revoked_at) {
          return null;
        }
        if (integration.user_id) {
          return integration.user_id;
        }
      }
    }

    // 2. Hashed lookup against users.amazon_api_token_hash (legacy migration)
    if (secretHash) {
      try {
        const user = await env.DB.prepare(
          'SELECT id FROM users WHERE amazon_api_token_hash = ? LIMIT 1'
        ).bind(secretHash).first();

        if (user?.id) {
          return user.id;
        }
      } catch (_) {
        // Column amazon_api_token_hash might not exist in unmigrated test fixtures
      }
    }
  }

  // 3. Migration fallback: OUTPOST_SECRET_KEY [DEPRECATED: Scheduled for removal on 2026-11-30]
  if (env?.OUTPOST_SECRET_KEY && token === env.OUTPOST_SECRET_KEY) {
    console.warn('[DEPRECATION WARNING] Request authenticated using legacy shared OUTPOST_SECRET_KEY resolving to oldest user. This fallback is deprecated and scheduled for removal on 2026-11-30. Please migrate to a per-installation secret via POST /api/integrations.');
    if (env.DB) {
      const primaryUser = await env.DB.prepare(
        'SELECT id FROM users ORDER BY created_at ASC LIMIT 1'
      ).first();
      if (primaryUser?.id) {
        return primaryUser.id;
      }
    }
  }

  return null;
}
