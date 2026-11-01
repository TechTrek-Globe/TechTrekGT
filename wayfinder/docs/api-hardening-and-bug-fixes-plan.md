  # Wayfinder Backend API Hardening & Bug Fixes Implementation Plan

  ## Overview
  This plan establishes comprehensive backend endpoint hardening, bug fixes, and API key connection validation across Wayfinder's Cloudflare Worker / Pages Functions services. It covers API key guards, atomic D1 batches, ownership verification, date parsing, calendar midnight rollovers, expense calculations, and document lifecycles.

  ---

  ## 1. Scope of Changes

  ### 1.1 API Key Connectivity & Authentication Guard (`gemini-parser.js` & API Routes)
  - **Files**: `wayfinder/functions/api/wayfinder/gemini-parser.js`, `wayfinder/functions/api/wayfinder/import-jobs.js`, `wayfinder/functions/api/wayfinder/email-worker.js`
  - **Actions**:
    - Implement and export `isApiKeyConnected(env)` in `gemini-parser.js`:
      ```javascript
      export function isApiKeyConnected(env) {
        const key = env?.GEMINI_API_KEY || env?.GOOGLE_API_KEY || env?.GOOGLE_MAPS_API_KEY;
        return Boolean(key && typeof key === 'string' && key.trim().length > 0);
      }
      ```
    - In `callGeminiRestApi({ apiKey, model, contents })`:
      - Add explicit validation check before invoking `fetch`:
        ```javascript
        if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
          throw new Error('Gemini API key is missing or empty');
        }
        ```
    - In `parseBookingDocument({ env = {}, text = '', base64 = null, mimeType = 'application/pdf', filename = '', user = null })`:
      - Accept `user` as parameter.
      - Check both `isApiKeyConnected(env)` and `user?.userId`.
      - If `!isApiKeyConnected(env)`: log warning `[gemini-parser] Gemini API key is missing or disconnected; bypassing Gemini and falling back to heuristic extraction.`
      - If `!user?.userId`: log warning `[gemini-parser] Unauthenticated user context; bypassing Gemini and falling back to heuristic extraction.`
      - If missing or unauthenticated, skip the Gemini REST API call entirely and fall back directly to `heuristicParseDocument`.
    - In `import-jobs.js`:
      - Pass `user` into `parseBookingDocument({ env, text, base64, mimeType, filename, user })` in the `action === 'parse'` handler.
    - In `email-worker.js`:
      - In `parseBookingWithGemini(env, bodyText, subject, from, user = null)`:
        - Pass `{ userId: inbox.user_id }` from the matched inbox record so authenticated inbox imports satisfy the user check.

  ### 1.2 Seeded / Shared Journey Approval & Expense Normalization (`import-jobs.js`)
  - **File**: `wayfinder/functions/api/wayfinder/import-jobs.js`
  - **Actions**:
    - In `action === 'approve'` journey query:
      - Ensure `finalJourneyId = j?.id || 'poland-christmas-2026'` so approved documents for seeded/shared journeys always resolve gracefully.
    - Verify `amountUsd` calculation:
      - USD: `parsedCost.amount`
      - PLN: `Math.round((parsedCost.amount / 4.0) * 100) / 100`
      - EUR: `Math.round((parsedCost.amount * 1.08) * 100) / 100`
    - Verify `paid_by_user_id` (`user.userId`) and `amount_usd` (`amountUsd`) are populated in both:
      - `INSERT INTO wayfinder_expenses`
      - Re-approval `UPDATE wayfinder_expenses`
    - Verify `mapDocTypeToExpenseCategory`:
      - Ensure `transport: 'transit'` mapping is present.

  ### 1.3 Luhn Digit Count Guardrail (`gemini-parser.js`)
  - **File**: `wayfinder/functions/api/wayfinder/gemini-parser.js`
  - **Actions**:
    - In `isLuhnValid(numStr)`:
      - Confirm `if (digits.length < 13 || digits.length > 19) return false;` immediately after cleaning non-digit characters.

  ### 1.4 Authentication & Atomic D1 Batches (`expenses.js`)
  - **File**: `wayfinder/functions/api/wayfinder/expenses.js`
  - **Actions**:
    - In `GET /api/wayfinder/expenses`:
      - Confirm `if (!user?.userId) return json({ error: 'Authentication required' }, 401);` at the top of the GET handler.
    - In all mutation handlers (`POST /settle`, `DELETE /settle`, `POST /preset`, `POST /expenses`, `PUT /expenses/:id`, `DELETE /expenses/:id`):
      - Replace loose `if (!user)` checks with strict `if (!user?.userId) return json({ error: 'Authentication required' }, 401);`.
    - Confirm atomic batch execution:
      - Verify `db.batch(stmts)` is used for all multi-statement mutations (`POST /preset`, `POST /expenses`, `PUT /expenses/:id`, `DELETE /expenses/:id`, `DELETE /settle`).
    - Confirm idempotent preset seeding:
      - Query `SELECT description FROM wayfinder_expenses WHERE journey_id = ? OR journey_id = 'poland-christmas-2026'` and filter out already-seeded presets.

  ### 1.5 Journey Slug Resolution & Companion Expenses (`budget.js`)
  - **File**: `wayfinder/functions/api/wayfinder/budget.js`
  - **Actions**:
    - Confirm expenses query matches:
      ```sql
      SELECT * FROM wayfinder_expenses
      WHERE (journey_id = ? OR journey_id = ?)
        AND (user_id = ? OR paid_by_user_id = ? OR id IN (SELECT expense_id FROM wayfinder_expense_splits WHERE user_id = ?))
      ORDER BY category, created_at
      ```
      bound to `(journey.id, journeyId, user.userId, user.userId, user.userId)`.

  ### 1.6 Full-Month Dates, End-Dates & Split Rounding (`email-worker.js`)
  - **File**: `wayfinder/functions/api/wayfinder/email-worker.js`
  - **Actions**:
    - Confirm date regexes accommodate Dec 16-31:
      - `(0[1-9]|[12]\d|3[01])` and `([12]\d|3[01]|0[1-9]|[1-9])`.
    - Confirm `end_date` persistence:
      - Stage 2 fallback: `if (geminiExtraction.end_date) fields.end_date = geminiExtraction.end_date;`
      - Itinerary insert: `fields.end_date || null` passed to `INSERT INTO wayfinder_itinerary_items`.
    - Confirm odd-cent split rounding:
      - `split1 = Math.floor((rawAmt / 2) * 100) / 100;`
      - `split2 = Number((rawAmt - split1).toFixed(2));`

  ### 1.7 Soft-Deleted Inbox Re-activation (`email-inboxes.js`)
  - **File**: `wayfinder/functions/api/wayfinder/email-inboxes.js`
  - **Actions**:
    - Confirm `POST /api/wayfinder/email-inboxes`:
      - Checks for existing record with `is_active === 0`, issues `UPDATE wayfinder_email_inboxes SET is_active = 1 WHERE id = ?`, and returns the reactivated inbox.

  ### 1.8 Calendar Midnight Rollover & Dynamic Feeds (`calendar.js`)
  - **File**: `wayfinder/functions/api/wayfinder/calendar.js`
  - **Actions**:
    - Confirm `addMinutesWithDate(dateStr, timeStr, minsToAdd)` returns `{ endDate, endTime }` and handles midnight rollovers.
    - Confirm `addMinutesWithDate` is utilized across all calendar event types (activities, flights, hotels, custom).
    - Confirm `getSubscribeUrls` computes `basePath` dynamically from `url.pathname.replace(/\/token\/?$/, '')`.

  ### 1.9 Document Permission Guardrails (`documents.js`)
  - **File**: `wayfinder/functions/api/wayfinder/documents.js`
  - **Actions**:
    - Confirm `PUT`/`PATCH` and `DELETE` endpoints verify ownership strictly without `OR visibility = 'public'`:
      ```sql
      WHERE id = ? 
        AND (user_id = ? OR journey_id IN (SELECT id FROM wayfinder_journeys WHERE created_by = ?))
        AND deleted_at IS NULL
      ```

  ### 1.10 Exchange Rate Fetch Timeout & Conversion Keys (`exchange-rate.js`)
  - **File**: `wayfinder/functions/api/wayfinder/exchange-rate.js`
  - **Actions**:
    - Confirm `signal: AbortSignal.timeout(8000)` on upstream fetch.
    - Confirm presence of explicit conversion keys (`usdToPln`, `eurToPln`, `gbpToPln`, `plnToUsd`) in JSON response.

  ---

  ## 2. Verification Protocol

  1. **Unit & Integration Script**:
    - Run `node scripts/verify-import-parser.mjs` to verify:
      - Luhn algorithm validation (digits 13-19).
      - Sensitive data redaction.
      - Heuristic parser ordering.
      - Odd-cent split conservation.
      - December 16-31 date regex handling.
      - Midnight calendar date rollovers.
      - Currency amount conversions.
  2. **Production Bundle Verification**:
    - Run `npm run build` in `wayfinder/` to verify zero bundle or lint regressions.
  3. **Documentation Synchronization**:
    - Update `wayfinder/docs/03_features.md` and `wayfinder/docs/04_state.md` with active state invariants.
