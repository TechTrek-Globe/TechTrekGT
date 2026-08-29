import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';

/**
 * GET /api/ebay/oauth-status
 *
 * Returns the eBay OAuth connection status for the authenticated user
 * by forwarding to the landing gateway and returning the result.
 *
 * The landing gateway owns the token storage; this outpost endpoint
 * is a lightweight proxy that the frontend calls using the standard
 * outpost cookie session.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    await requireAuth(request, env);

    const gatewayBase = env.GATEWAY_URL || 'https://techtrekgt.com';

    const res = await fetch(`${gatewayBase}/api/ebay/oauth/status`, {
      headers: {
        // Forward the session cookie so gateway can auth the user
        Cookie: request.headers.get('Cookie') || '',
        Origin: 'https://techtrekgt.com'
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return err(data.error || 'Gateway error', res.status);
    return ok(data.data || data);
  });
}
