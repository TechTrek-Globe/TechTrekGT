-- =============================================================================
-- T-09: Standardize auction_sales.roi_pct to a FRACTION.
--
-- WHY THIS IS A RECOMPUTE, NOT A HEURISTIC FIX
-- ------------------------------------------------
-- POST /api/ebay/match-sold-vinescout stored roi_pct as netProfit/landedCost*100
-- while every other write path stored net_profit/true_total_cost. So some rows
-- hold 0.35 and some hold 35.0 for the SAME underlying economics.
--
-- The tempting shortcut is "anything above 1.5 is a percentage, divide by 100".
-- That is WRONG and destructive: a legitimate 350% return on a $10 flip sold for
-- $45 stores roi_pct = 3.5 as a fraction. A heuristic would silently halve every
-- genuinely spectacular sale. (That specific case is real here: VineScout items
-- with near-zero ETV routinely return multiples of cost.)
--
-- So this migration does not guess. It RECOMPUTES from the authoritative
-- columns, net_profit and true_total_cost, which are themselves unit-unambiguous
-- dollar amounts. Every row that is wrong becomes right; every row that is right
-- is rewritten to the identical value.
--
-- IRREVERSIBILITY
-- --------------
-- There is no way to distinguish a stored fraction from a stored percentage
-- after the fact, so the "old" values cannot be reconstructed. Step 1 below
-- takes a full snapshot before anything is touched. To roll back:
--
--   UPDATE auction_sales SET roi_pct = (SELECT roi_pct FROM auction_sales_roi_pct_backup b WHERE b.id = auction_sales.id)
--
-- IDEMPOTENCE
-- ----------
-- The WHERE guards compare against the value being written, so a second run
-- changes zero rows. (SQLite's changes() counts matched rows even when the new
-- value equals the old, hence the explicit guards rather than a bare UPDATE.)
--
-- APPLY WITH:  npx wrangler d1 execute personal-budget-db --remote --file=./migrations/0009_roi_pct_fraction.sql
-- =============================================================================

-- Step 1 (irreversible operation): full snapshot BEFORE any mutation.
CREATE TABLE IF NOT EXISTS auction_sales_roi_pct_backup AS SELECT * FROM auction_sales;

-- Step 2: recompute from the authoritative columns. net_profit is in dollars,
-- true_total_cost is in dollars, so the quotient is unitless by construction.
UPDATE auction_sales
   SET roi_pct = ROUND(net_profit / true_total_cost, 4)
 WHERE true_total_cost > 0
   AND (roi_pct IS NULL OR roi_pct <> ROUND(net_profit / true_total_cost, 4));

-- Step 3: zero/negative/NULL cost has no defined ROI. Store 0, never Infinity
-- or NaN, which is what computeSaleMetrics already returns for that case.
UPDATE auction_sales
   SET roi_pct = 0
 WHERE (true_total_cost <= 0 OR true_total_cost IS NULL)
   AND (roi_pct IS NULL OR roi_pct <> 0);