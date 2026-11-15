import { requireAuth, withAuth, ok, err } from '../../utils/guard.js';
import {
  resolvePnlDateRange,
  buildNonVinePnlStatements,
  formatNonVinePnlSummary
} from '../../utils/nonVinePnl.js';

/**
 * GET /api/reports/non-vine-pnl
 * Compares total non-Vine invoice acquisition costs against realized non-Vine sold payouts
 * to report current net cash standing while explicitly excluding Amazon VineScout items.
 * Query params: ?range=all|ytd|90d|30d
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  return withAuth(async () => {
    const { userId } = await requireAuth(request, env);
    if (!env.DB) return err('Database binding unavailable', 500);

    const url = new URL(request.url);
    const { range, startDate } = resolvePnlDateRange(url.searchParams.get('range'));
    const statements = buildNonVinePnlStatements(env.DB, userId, startDate);

    let spendRow = null;
    let salesRow = null;
    let vineRow = null;

    if (typeof env.DB.batch === 'function') {
      const results = await env.DB.batch(statements);
      spendRow = results?.[0]?.results?.[0] || null;
      salesRow = results?.[1]?.results?.[0] || null;
      vineRow = results?.[2]?.results?.[0] || null;
    } else {
      spendRow = await statements[0].first();
      salesRow = await statements[1].first();
      vineRow = await statements[2].first();
    }

    const summary = formatNonVinePnlSummary(spendRow, salesRow, vineRow, range, startDate);
    return ok({ summary });
  });
}
