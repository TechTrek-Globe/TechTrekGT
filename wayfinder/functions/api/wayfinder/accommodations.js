const accommodationByJourney = {
  'poland-christmas-2026': [
    {
      id: 'wroclaw-altus-palace-2026',
      docType: 'hotel',
      title: 'Altus Palace Wrocław',
      hotel_name: 'Altus Palace Wrocław',
      location: 'Wrocław, Poland',
      guest_name: 'Jon',
      check_in_date: '2026-12-07',
      check_in_time: '15:00',
      check_out_date: '2026-12-09',
      website_url: 'https://www.hotelaltuspalace.pl',
      phone: '+48 717475000',
      email: 'info@hotelaltuspalace.pl'
    }
  ]
};

export async function handleAccommodations(context, url, method) {
  if (!context.user?.userId) return json({ error: 'Unauthorized' }, 401);
  if (method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId');
  if (!journeyId) return json({ error: 'journey_id required' }, 400);

  return json({ accommodations: accommodationByJourney[journeyId] || [] });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store'
    }
  });
}