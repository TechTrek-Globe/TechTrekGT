/**
 * POST /api/sync/item (REMOVED)
 *
 * This endpoint was a direct alias for POST /api/import/amazon.
 * External clients must switch to POST /api/import/amazon with the
 * same payload format and a valid api_integrations secret.
 *
 * See: https://techtrekgt.com/outpost/settings (API Integrations tab)
 */
export async function onRequestPost() {
  return new Response(JSON.stringify({
    error: 'This endpoint is removed. Use POST /api/import/amazon with an integration secret from Settings > API Integrations.'
  }), {
    status: 410,
    headers: {
      'Content-Type': 'application/json',
      Deprecation: 'true',
      Link: '</api/import/amazon>; rel="successor"'
    }
  });
}
