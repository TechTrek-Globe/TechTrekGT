import { json } from '../../utils/auth.js';

/**
 * GET /api/auth/turnstile-config
 * Returns whether Turnstile bot verification is active and the public site key.
 */
export async function onRequestGet(context) {
  const { env } = context;
  const siteKey = env?.TURNSTILE_SITE_KEY || null;
  const isEnabled = Boolean(env?.TURNSTILE_SECRET_KEY && siteKey);

  return json({
    success: true,
    enabled: isEnabled,
    siteKey: isEnabled ? siteKey : null
  });
}
