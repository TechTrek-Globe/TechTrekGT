// GET /api/wayfinder/journeys - list user's accessible journeys
// GET /api/wayfinder/journeys/:slug - get single journey with destinations

export async function handleJourneys(context, url, method) {
  const { env, user } = context;
  const parts = url.pathname.split('/').filter(Boolean);
  const journeyIdx = parts.indexOf('journeys');
  const slug = journeyIdx !== -1 ? (parts[journeyIdx + 1] || null) : null;

  try {
    if (!env.DB) {
      return json({ error: 'Database not available' }, 503);
    }

    if (method === 'GET') {
      if (slug) {
        // Single journey by slug - user must own it OR it must be public
        const journey = await env.DB.prepare(
          `SELECT * FROM wayfinder_journeys WHERE slug = ? AND (created_by = ? OR visibility = 'public')`
        ).bind(slug, user.userId).first();

        if (!journey) return json({ error: 'Journey not found' }, 404);

        const destinations = await env.DB.prepare(
          `SELECT * FROM wayfinder_destinations WHERE journey_id = ? ORDER BY sort_order`
        ).bind(journey.id).all();

        return json({ journey, destinations: destinations.results });
      }

      // List all journeys accessible to this user
      const journeys = await env.DB.prepare(
        `SELECT * FROM wayfinder_journeys WHERE created_by = ? OR visibility = 'public' ORDER BY created_at DESC`
      ).bind(user.userId).all();

      return json({ journeys: journeys.results });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[journeys] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
