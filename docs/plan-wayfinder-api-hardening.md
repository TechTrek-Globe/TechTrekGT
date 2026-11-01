# Implementation Plan: Wayfinder Cross-File API Hardening and Bug Fixes

## Executive Overview
This implementation plan outlines the exact surgical edits, architectural alignments, database operations, and test verifications required across the TechTrekGT Wayfinder backend API endpoints (`import-jobs.js`, `gemini-parser.js`, `expenses.js`, `budget.js`, `email-worker.js`, `email-inboxes.js`, `calendar.js`, `documents.js`, and `exchange-rate.js`).

All changes conform strictly to TechTrekGT workspace rules:
- Pure JavaScript (ESM) with zero TypeScript (.ts/.tsx).
- Positional `?` parameter binding for all Cloudflare D1 SQLite queries.
- Atomic `await env.DB.batch(stmts)` for all multi-statement operations.
- Zero Em dashes: using standard hyphens (-) and colons (:) exclusively.
- Zero-touch whitespace on adjacent working lines.

---

## 1. File-by-File Technical Specifications

### 1.1 `wayfinder/functions/api/wayfinder/import-jobs.js`
1. **Seeded / Shared Journey Approval Fix (`action === 'approve'`)**:
   - In lines 241-245:
     ```javascript
     // Current:
     const j = await env.DB.prepare(
       `SELECT id FROM wayfinder_journeys WHERE (id = ? OR slug = ?) AND created_by = ?`
     ).bind(journey_id, journey_id, user.userId).first();
     if (!j) return json({ error: 'Journey not found' }, 404);
     const finalJourneyId = j.id;
     ```
   - Replace with resilient lookup that matches if created by current user OR if matching the shared `'poland-christmas-2026'` journey:
     ```javascript
     const j = await env.DB.prepare(
       `SELECT id FROM wayfinder_journeys
        WHERE (id = ? OR slug = ?)
          AND (created_by = ? OR slug = 'poland-christmas-2026' OR id = 'poland-christmas-2026')`
     ).bind(journey_id, journey_id, user.userId).first();
     const finalJourneyId = j?.id || (journey_id === 'poland-christmas-2026' ? 'poland-christmas-2026' : null);
     if (!finalJourneyId) return json({ error: 'Journey not found' }, 404);
     ```
2. **Populate `paid_by_user_id` and `amount_usd` on Approved Expenses**:
   - Compute `amountUsd`:
     ```javascript
     let amountUsd = parsedCost.amount;
     if (parsedCost.currency === 'PLN') {
       amountUsd = Math.round((parsedCost.amount / 4.0) * 100) / 100;
     } else if (parsedCost.currency === 'EUR') {
       amountUsd = Math.round((parsedCost.amount * 1.08) * 100) / 100;
     }
     ```
   - In `INSERT INTO wayfinder_expenses`, add `paid_by_user_id` and `amount_usd` to column list and bind values:
     `paid_by_user_id` -> `user.userId`, `amount_usd` -> `amountUsd`.
   - In `UPDATE wayfinder_expenses` (`else` branch for re-approval), update `amount_usd = ?, paid_by_user_id = ?` and bind `amountUsd, user.userId`.
3. **Expense Category Mapping (`mapDocTypeToExpenseCategory`)**:
   - In `mapDocTypeToExpenseCategory(docType)` around line 496:
     Add `transport: 'transit'` to the lookup dictionary.

---

### 1.2 `wayfinder/functions/api/wayfinder/gemini-parser.js`
1. **Luhn Digit Count Guard (`isLuhnValid`)**:
   - In `isLuhnValid(numStr)` (line 465):
     ```javascript
     function isLuhnValid(numStr) {
       const digits = numStr.replace(/\D/g, '');
       if (digits.length < 13 || digits.length > 19) return false;
       let sum = 0;
       let alt = false;
       for (let i = digits.length - 1; i >= 0; i--) {
     ```
   - Ensures strings matched by `SENSITIVE_CC_REGEX` that contain spaces or hyphens but fewer than 13 digits cannot pass Luhn validation.

---

### 1.3 `wayfinder/functions/api/wayfinder/expenses.js`
1. **Require Authentication on `GET /api/wayfinder/expenses`**:
   - At the beginning of `method === 'GET'` (around line 112):
     ```javascript
     if (!user?.userId) return json({ error: 'Authentication required' }, 401);
     ```
2. **Idempotent Preset Seeding (`POST /api/wayfinder/expenses/preset`)**:
   - Before inserting preset expenses, query existing expense descriptions:
     ```javascript
     const existingDescs = await db.prepare(
       `SELECT description FROM wayfinder_expenses WHERE journey_id = ? OR journey_id = 'poland-christmas-2026'`
     ).bind(journeyId).all();
     const existingSet = new Set((existingDescs.results || []).map(r => r.description));
     const toInsert = presets.filter(p => !existingSet.has(p.desc));
     ```
   - Skip if `toInsert.length === 0` (returns `{ success: true, seeded: 0, message: 'All preset expenses already seeded' }`).
3. **Atomic D1 Batches for Multi-Statement Mutations**:
   - `POST /preset`: Collect all `INSERT INTO wayfinder_expenses` and `INSERT INTO wayfinder_expense_splits` statements into a single array `const stmts = [...]` and execute `await db.batch(stmts)`.
   - `POST /expenses`: Collect `INSERT INTO wayfinder_expenses` and all split insertions into `const stmts = [...]` and execute `await db.batch(stmts)`.
   - `PUT /expenses/:id`: Collect `UPDATE wayfinder_expenses`, `DELETE FROM wayfinder_expense_splits`, and all split insertions into a single `db.batch(stmts)` array.
   - `DELETE /expenses/:id`: Combine `DELETE FROM wayfinder_expense_splits` and `DELETE FROM wayfinder_expenses` into `await db.batch([stmt1, stmt2])`.
   - `DELETE /settle`: In split-specific and settlement-specific deletions, combine the `UPDATE wayfinder_expense_splits` and `DELETE FROM wayfinder_expense_settlements` into `await db.batch([stmt1, stmt2])`.

---

### 1.4 `wayfinder/functions/api/wayfinder/budget.js`
1. **Fix Journey Slug Resolution & Companion Expense Visibility**:
   - In lines 18-20:
     ```javascript
     // Current:
     const expenses = await env.DB.prepare(
       'SELECT * FROM wayfinder_expenses WHERE journey_id = ? AND user_id = ? ORDER BY category, created_at'
     ).bind(journeyId, user.userId).all();
     ```
   - Update to query using both `journey.id` and `journeyId` and include companion expenses:
     ```javascript
     const expenses = await env.DB.prepare(
       `SELECT * FROM wayfinder_expenses
        WHERE (journey_id = ? OR journey_id = ?)
          AND (user_id = ? OR id IN (SELECT expense_id FROM wayfinder_expense_splits WHERE user_id = ?))
        ORDER BY category, created_at`
     ).bind(journey.id, journeyId, user.userId, user.userId).all();
     ```
   - Allows shared trip expenses paid by travel companion Ronald Few (`usr-ronald-few`) where Jonathan Kemp has an assigned split to properly reflect in journey budget aggregates.

---

### 1.5 `wayfinder/functions/api/wayfinder/email-worker.js`
1. **Fix December 16-31 Date Regex Truncation**:
   - In `parseGetYourGuideEmail` (line 305):
     Change `/2026-(12)-(0[1-9]|1[0-5])/` to `/2026-(12)-(0[1-9]|[12]\d|3[01])/`.
   - In `extractBookingFields` (line 443):
     Change `/2026-(12)-(0[1-9]|1[0-5])/` to `/2026-(12)-(0[1-9]|[12]\d|3[01])/`.
   - In `extractBookingFields` (line 456):
     Change `([1-9]|0[1-9]|1[0-5])` to `([1-9]|0[1-9]|[12]\d|3[01])`.
2. **Preserve `end_date` on Inbound Emails**:
   - In `handleInboundEmail` Stage 2 fallback (around line 577):
     ```javascript
     if (geminiExtraction.end_date) {
       fields.end_date = geminiExtraction.end_date;
     }
     ```
   - In `INSERT INTO wayfinder_itinerary_items` (lines 697-714):
     Add `end_date` to the SQL columns and bind `fields.end_date || null`.
3. **Fix Odd-Cent Split Rounding**:
   - In `handleInboundEmail` (lines 730-776):
     Replace:
     ```javascript
     const halfAmount = Math.round((rawAmt / 2) * 100) / 100;
     ```
     With:
     ```javascript
     const split1 = Math.floor((rawAmt / 2) * 100) / 100;
     const split2 = Number((rawAmt - split1).toFixed(2));
     ```
     Bind `split1` to user split and `split2` to companion Ronald Few split so odd-penny totals (e.g. $366.43 -> $183.21 + $183.22) equal the exact receipt amount.

---

### 1.6 `wayfinder/functions/api/wayfinder/email-inboxes.js`
1. **Re-activate Soft-Deleted Inboxes on `POST`**:
   - In `POST /api/wayfinder/email-inboxes` (lines 60-64):
     ```javascript
     const existing = await env.DB.prepare(
       'SELECT * FROM wayfinder_email_inboxes WHERE user_id = ? AND journey_id = ?'
     ).bind(user.userId, journey.id).first();
     if (existing) {
       if (existing.is_active === 0) {
         await env.DB.prepare(
           'UPDATE wayfinder_email_inboxes SET is_active = 1 WHERE id = ?'
         ).bind(existing.id).run();
         existing.is_active = 1;
       }
       return json({ inbox: safeInbox(existing), created: false });
     }
     ```

---

### 1.7 `wayfinder/functions/api/wayfinder/calendar.js`
1. **Fix Midnight Rollover on Event End Dates**:
   - Add helper function:
     ```javascript
     function addMinutesWithDate(dateStr, timeStr, minsToAdd) {
       const [h, m] = (timeStr || '12:00').split(':').map(Number);
       const total = h * 60 + m + minsToAdd;
       const daysToAdd = Math.floor(total / 1440);
       const remainingMinutes = ((total % 1440) + 1440) % 1440;
       const endH = Math.floor(remainingMinutes / 60);
       const endM = remainingMinutes % 60;
       const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
       const endDate = daysToAdd > 0 ? addDays(dateStr, daysToAdd) : dateStr;
       return { endDate, endTime };
     }
     ```
   - In `gatherEvents`:
     - Scheduled itinerary items: use `addMinutesWithDate(day.date, startTime, durationMins)`.
     - Flight DL9208: use `addMinutesWithDate(f.arrivalDate || '2026-12-04', f.arrivalTime || '13:30', 60)`.
     - Hotel check-in: use `addMinutesWithDate(acc.check_in_date, acc.check_in_time || '15:00', 60)`.
     - Hotel check-out: use `addMinutesWithDate(acc.check_out_date, acc.check_out_time || '11:00', 30)`.
     - Private D1 items: when `!item.end_time`, compute `{ endDate, endTime }` via `addMinutesWithDate(item.local_date, startTime, 90)`. If `item.end_time` is specified without explicit `item.end_date` and `item.end_time < startTime`, advance `endDate` using `addDays(item.local_date, 1)`.
2. **Dynamic Feed Path Construction (`getSubscribeUrls`)**:
   - Derive base path dynamically from `url.pathname`:
     ```javascript
     function getSubscribeUrls(requestUrl, token) {
       const url = new URL(requestUrl);
       const host = url.host;
       const protocol = url.protocol;
       const basePath = url.pathname.replace(/\/token\/?$/, '');
       const feedPath = `${basePath}/feed/${token}.ics`;

       const feedUrl = `${protocol}//${host}${feedPath}`;
       const webcalUrl = `webcal://${host}${feedPath}`;
       const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl)}`;
       const outlookUrl = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent('Poland Christmas 2026')}`;

       return {
         feed_url: feedUrl,
         webcal_url: webcalUrl,
         google_url: googleUrl,
         outlook_url: outlookUrl,
         apple_url: webcalUrl
       };
     }
     ```

---

### 1.8 `wayfinder/functions/api/wayfinder/documents.js`
1. **Tighten Ownership Check on Rename (`PUT`/`PATCH`) and Cascade Delete (`DELETE`)**:
   - In `PUT`/`PATCH` (lines 149-154):
     Replace:
     ```sql
     SELECT * FROM wayfinder_documents 
     WHERE id = ? 
       AND (user_id = ? OR journey_id IN (SELECT id FROM wayfinder_journeys WHERE created_by = ? OR visibility = 'public'))
       AND deleted_at IS NULL
     ```
     With:
     ```sql
     SELECT * FROM wayfinder_documents 
     WHERE id = ? 
       AND (user_id = ? OR journey_id IN (SELECT id FROM wayfinder_journeys WHERE created_by = ?))
       AND deleted_at IS NULL
     ```
   - In `DELETE` (lines 183-188):
     Apply the exact same fix so public journey visibility does not grant delete permissions over another user's documents.

---

### 1.9 `wayfinder/functions/api/wayfinder/exchange-rate.js`
1. **Add Upstream Fetch Timeout & Explicit Conversion Keys**:
   - Add timeout signal:
     ```javascript
     const apiRes = await fetch('https://open.er-api.com/v6/latest/USD', {
       signal: AbortSignal.timeout(8000),
     });
     ```
   - Include conversion keys in 200 payload:
     ```javascript
     const payload = {
       base: 'USD',
       rates: {
         PLN: parseFloat(pln.toFixed(4)),
         EUR: parseFloat(eur.toFixed(4)),
         GBP: parseFloat(gbp.toFixed(4)),
       },
       usdToPln: parseFloat(pln.toFixed(2)),
       eurToPln: parseFloat(eur.toFixed(2)),
       gbpToPln: parseFloat(gbp.toFixed(2)),
       plnToUsd: parseFloat((1 / pln).toFixed(4)),
       timestamp: Date.now(),
       lastUpdated: new Date().toISOString(),
     };
     ```

---

## 2. Verification Test Suite Expansion

In `wayfinder/scripts/verify-import-parser.mjs`:
1. **Luhn Digit Count Verification**:
   - Verify `isLuhnValid` directly:
     - 7 digits ("1 2 3 4 5 6 7") -> returns `false`.
     - 12 digits ("1234-5678-9012") -> returns `false`.
     - Valid 16-digit card -> returns `true`.
     - 20 digits -> returns `false`.
2. **Date Regex Verification (Dec 16-31)**:
   - Match `2026-12-18`, `2026-12-25`, `2026-12-31` in sample text.
   - Match `Dec 24` and `December 31st` in natural language.
3. **Midnight Rollover Verification**:
   - Test `addMinutesWithDate('2026-12-07', '23:30', 90)` -> `{ endDate: '2026-12-08', endTime: '01:00' }`.
   - Test `addMinutesWithDate('2026-12-07', '14:00', 60)` -> `{ endDate: '2026-12-07', endTime: '15:00' }`.
4. **Expense `amount_usd` & Split Preservation**:
   - Validate PLN (4.0) conversion to USD.
   - Validate EUR (1.08) conversion to USD.
   - Partition 366.43 -> 183.21 and 183.22, asserting `split1 + split2 === 366.43`.

---

## 3. Mandatory Documentation & Build Steps

1. Execute test suite with Node.js (`node wayfinder/scripts/verify-import-parser.mjs`).
2. Run `npm run build` in `wayfinder/` to verify zero bundle or syntax regressions.
3. Update `wayfinder/docs/03_features.md` and `wayfinder/docs/04_state.md` to document the new hardened contracts, atomic D1 batches, and updated API schemas.
