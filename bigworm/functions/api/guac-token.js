import { verifyToken, getTokenFromRequest } from '../utils/auth.js';

/**
 * JWT-gated Guacamole token exchange endpoint.
 * - Validates the BigWorm JWT cookie
 * - Makes a server-side POST to Guacamole's /api/tokens with env credentials
 * - Returns the Guacamole auth token + first available connection ID to the React client
 * - The React GuacamoleView uses this token to connect via guacamole-common-js
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  const token = getTokenFromRequest(request);
  const payload = await verifyToken(token, env.JWT_SECRET);

  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.GUACAMOLE_INTERNAL_URL || !env.GUAC_USERNAME || !env.GUAC_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Guacamole not configured on server' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Exchange credentials for a Guacamole session token
    const guacTokenRes = await fetch(`${env.GUACAMOLE_INTERNAL_URL}/guacamole/api/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: env.GUAC_USERNAME,
        password: env.GUAC_PASSWORD
      })
    });

    if (!guacTokenRes.ok) {
      const errText = await guacTokenRes.text();
      console.error('[guac-token] Guacamole auth failed:', guacTokenRes.status, errText);
      return new Response(JSON.stringify({ error: 'Failed to authenticate with Guacamole service' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const guacData = await guacTokenRes.json();
    const guacToken = guacData.authToken;

    // Fetch available connections to find the home RDP connection ID
    const connRes = await fetch(
      `${env.GUACAMOLE_INTERNAL_URL}/guacamole/api/session/data/default/connections`,
      {
        headers: {
          'Guacamole-Token': guacToken,
          'Content-Type': 'application/json'
        }
      }
    );

    let connectionId = null;
    if (connRes.ok) {
      const connections = await connRes.json();
      const ids = Object.keys(connections);
      if (ids.length > 0) {
        connectionId = ids[0]; // Use first connection (the home RDP)
      }
    }

    return new Response(JSON.stringify({
      guacToken,
      connectionId,
      dataSource: 'default'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[guac-token] error:', err);
    return new Response(JSON.stringify({ error: 'Failed to reach Guacamole service. Is the tunnel running?' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
