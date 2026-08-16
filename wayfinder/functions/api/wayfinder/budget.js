// GET /api/wayfinder/budget?journey_id=
// Returns aggregate expense data for the authenticated user's journey

export async function handleBudget(context, url, method) {
  const { env, user } = context;
  const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId');

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);
    if (!journeyId) return json({ error: 'journey_id required' }, 400);

    // Ownership check
    const journey = await env.DB.prepare(
      'SELECT id FROM wayfinder_journeys WHERE id = ? AND created_by = ?'
    ).bind(journeyId, user.userId).first();
    if (!journey) return json({ error: 'Journey not found' }, 404);

    const expenses = await env.DB.prepare(
      'SELECT * FROM wayfinder_expenses WHERE journey_id = ? AND user_id = ? ORDER BY category, created_at'
    ).bind(journeyId, user.userId).all();

    // Aggregate by category
    const byCategory = {};
    let totalKnown = 0;
    let totalUnknown = 0;

    for (const e of expenses.results) {
      const cat = e.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = { category: cat, count: 0, total_original: {}, total_usd: 0 };
      byCategory[cat].count++;

      if (e.amount_original && e.currency_original) {
        const key = e.currency_original;
        byCategory[cat].total_original[key] = (byCategory[cat].total_original[key] || 0) + e.amount_original;
      }
      if (e.amount_usd) {
        byCategory[cat].total_usd += e.amount_usd;
        totalKnown += e.amount_usd;
      } else {
        totalUnknown++;
      }
    }

    return json({
      journey_id:       journeyId,
      total_usd_known:  Math.round(totalKnown * 100) / 100,
      items_no_cost:    totalUnknown,
      expense_count:    expenses.results.length,
      by_category:      Object.values(byCategory),
      currency_note:    'Converted amounts are estimates. Original amounts and currencies are preserved per expense.',
      expenses:         expenses.results.map(safeExpense),
    });
  } catch (err) {
    console.error('[budget] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
}

function safeExpense(e) {
  return {
    id:                   e.id,
    category:             e.category,
    description:          e.description,
    amount_original:      e.amount_original,
    currency_original:    e.currency_original,
    amount_usd:           e.amount_usd,
    is_converted:         e.is_converted === 1,
    exchange_rate_date:   e.exchange_rate_date,
    exchange_rate_source: e.exchange_rate_source,
    is_refundable:        e.is_refundable === 1,
    refund_status:        e.refund_status,
    cancellation_deadline:e.cancellation_deadline,
    paid_status:          e.paid_status,
    verification_status:  e.verification_status,
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
