// GET /api/wayfinder/budget?journey_id=
// Returns aggregate expense data for the authenticated user's journey

import { resolveAgendaAccess, canViewSensitive } from '../../utils/agendaAccess.js';

export async function handleBudget(context, url, method) {
  const { env, user } = context;
  const journeyId = url.searchParams.get('journey_id') || url.searchParams.get('journeyId') || 'poland-christmas-2026';

  try {
    if (!env.DB) return json({ error: 'Database not available' }, 503);
    if (!user?.userId) return json({ error: 'Authentication required' }, 401);

    // Budget is restricted to owner, share admin and platform admin
    const access = await resolveAgendaAccess(env, journeyId, user);
    const journey = access.journey;
    if (!journey) {
      return json({ error: 'Journey not found' }, 404);
    }
    if (!canViewSensitive(access.role)) {
      return json({ error: 'Forbidden' }, 403);
    }

    const [expenses, categoryStats, totals] = await Promise.all([
      env.DB.prepare(
        `SELECT * FROM wayfinder_expenses
         WHERE (journey_id = ? OR journey_id = ?)
         ORDER BY category, created_at`
      ).bind(journey.id, journeyId).all(),
      env.DB.prepare(
        `SELECT category,
                COUNT(*) as count,
                ROUND(COALESCE(SUM(amount_usd), 0), 2) as total_usd
         FROM wayfinder_expenses
         WHERE (journey_id = ? OR journey_id = ?)
         GROUP BY category`
      ).bind(journey.id, journeyId).all(),
      env.DB.prepare(
        `SELECT 
           COUNT(*) as expense_count,
           ROUND(COALESCE(SUM(amount_usd), 0), 2) as total_usd_known,
           SUM(CASE WHEN amount_usd IS NULL THEN 1 ELSE 0 END) as items_no_cost
         FROM wayfinder_expenses
         WHERE (journey_id = ? OR journey_id = ?)`
      ).bind(journey.id, journeyId).first()
    ]);

    const byCategoryMap = {};
    for (const stat of (categoryStats.results || [])) {
      const cat = stat.category || 'other';
      byCategoryMap[cat] = {
        category: cat,
        count: stat.count,
        total_original: {},
        total_usd: stat.total_usd
      };
    }

    for (const e of expenses.results) {
      const cat = e.category || 'other';
      if (byCategoryMap[cat] && e.amount_original && e.currency_original) {
        const key = e.currency_original;
        byCategoryMap[cat].total_original[key] = (byCategoryMap[cat].total_original[key] || 0) + e.amount_original;
      }
    }

    return json({
      journey_id:       journeyId,
      total_usd_known:  totals?.total_usd_known || 0,
      items_no_cost:    totals?.items_no_cost || 0,
      expense_count:    totals?.expense_count || expenses.results.length,
      by_category:      Object.values(byCategoryMap),
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
