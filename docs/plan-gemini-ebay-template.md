# Implementation Plan: Gemini AI eBay Listing Details Generator

## 1. Architectural Overview & Scope

This plan details the cross-stack implementation for integrating the Google Gemini API (`gemini-3.8-flash` via the Interactions API) into Outpost Tracker to dynamically generate context-aware eBay HTML middle sections (specifically the dark-theme **Condition** and **Key Details** cards).

### Stack & Architectural Invariants
- **Pure JavaScript (JSX/ESM)**: Strictly `.js` and `.jsx` files. Zero TypeScript (`.ts` / `.tsx`).
- **Base Path**: Strictly scoped to `/outpost/`.
- **Backend Runtime**: Cloudflare Worker ESM ([src/worker.js](file:///e:/TechTrekGT/outpost/src/worker.js)) with `nodejs_compat`.
- **Resilience & Error Standards**:
  - **AUDIT-003**: Strict 15-second network timeout via `AbortSignal.timeout(15000)` (and `fetchWithTimeout`), catching timeout and upstream API failures cleanly without crashing Worker isolates.
  - **AUDIT-004**: Centralized `apiFetch` error handling (rejecting `{ success: false }`), non-blocking UI error banners (zero `alert()` calls), and guaranteed loading state recovery inside `finally {}` blocks.
- **Punctuation Invariant**: Zero em dashes anywhere in code, prompts, UI copy, or documentation. Standard hyphens (`-`), colons (`:`), or parentheses (`()`) only.

---

## 2. Backend Implementation (Cloudflare Worker)

### 2.1 New Serverless Endpoint: `POST /api/ai/generate-ebay-details`
- **File**: [outpost/functions/api/ai/generate-ebay-details.js](file:///e:/TechTrekGT/outpost/functions/api/ai/generate-ebay-details.js)
- **Authentication**: Protected via `withAuth` and `requireAuth(request, env)` from [outpost/functions/utils/guard.js](file:///e:/TechTrekGT/outpost/functions/utils/guard.js) (validates HttpOnly `auth_token` cookie and `users.token_version` in D1).
- **Environment Variable**: Reads `env.GEMINI_API_KEY`. If missing, returns a structured 503 response (`{ success: false, error: 'AI generation service is not configured (missing GEMINI_API_KEY).' }`).
- **Request Payload**:
  ```json
  {
    "title": "string",
    "brand": "string",
    "productType": "string",
    "condition": "string",
    "conditionHeader": "string",
    "conditionSubheader": "string",
    "notes": "string",
    "specs": "string | array | object",
    "features": "string | array"
  }
  ```
- **Input Validation**: Requires at least `title` (or `notes`) to be non-empty; otherwise returns HTTP 400 with `{ success: false, error: 'Item title or notes are required to generate AI details.' }`.
- **Prompt & Gemini API Integration**:
  - Uses the current Google Gemini Interactions API (`POST https://generativelanguage.googleapis.com/v1beta/interactions` with `Api-Revision: 2026-05-20` and `x-goog-api-key: env.GEMINI_API_KEY`) and model `gemini-3.8-flash` (`store: false`).
  - **System Instruction**: Instructs Gemini to act as an expert eBay copywriter for TechTrek Outpost and output ONLY the clean HTML for two dark-theme cards (**Condition** and **Key Details**) matching our exact inline style specification:
    - Card container style: `background-color:rgb(17,17,17); border:1px solid rgb(51,51,51); padding:18px; margin-bottom:15px; border-radius:6px;`
    - Heading style: `<h3 style="color:rgb(241,193,91); margin-top:0;">Condition</h3>` and `<h3 style="color:rgb(241,193,91); margin-top:0;">Key Details</h3>`
    - Body text style: `<p style="margin-bottom:0; color:#e0e0e0;">...</p>`
    - Bullet list style: `<ul style="margin:0; padding-left:20px; color:#e0e0e0;"><li>...</li></ul>`
    - Strict rule in prompt: Never use em dashes; use standard hyphens, colons, or parentheses. Do not wrap in markdown code fences (` ```html `).
  - **Sanitization**: Strips any accidental markdown code fences (` ```html ... ``` `) and replaces any em dashes (`\u2014` or `\u2013`) with standard hyphens (` - `) before returning.
- **Timeout & Error Handling (AUDIT-003)**:
  - Enforces a 15-second max timeout using `AbortSignal.timeout(15000)` via `fetchWithTimeout` from [outpost/functions/api/ebay/tokenHelper.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/tokenHelper.js).
  - Catches `TimeoutError` / `AbortError` (`err.isTimeout`), returning HTTP 504 with `{ success: false, error: 'AI generation timed out after 15 seconds. Please try again.' }`.
  - Catches upstream HTTP 429 / 5xx errors and returns a clean JSON error payload `{ success: false, error: '...' }`.
- **Success Response**:
  ```json
  {
    "success": true,
    "html": "<div style=\"background-color:rgb(17,17,17); ...\">...</div>"
  }
  ```

### 2.2 Route Registration & Client API Helper
- **Worker Route Table**: Register `POST /api/ai/generate-ebay-details` in [outpost/src/worker.js](file:///e:/TechTrekGT/outpost/src/worker.js) (`ROUTES` array with `auth: 'session'`).
- **Client API Utility**: Add `generateAiEbayDetails(payload)` in [outpost/src/utils/auctionApi.js](file:///e:/TechTrekGT/outpost/src/utils/auctionApi.js) using `apiFetch('/api/ai/generate-ebay-details', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) })`.

---

## 3. Template Generator Logic

### 3.1 Dynamic Middle Section Support in `ebayTemplate.js`
- **File**: [outpost/src/utils/ebayTemplate.js](file:///e:/TechTrekGT/outpost/src/utils/ebayTemplate.js)
- **Update `generateEbayListingHtml(item = {})`**:
  - Accept an optional `aiGeneratedMiddleSection` string on the input object (`item.aiGeneratedMiddleSection`).
  - When `aiGeneratedMiddleSection` is provided and non-empty (after `.trim()`), inject it directly between the **Header Banner** card and the **Authentication / What's Included** cards in place of the static **Condition** and **Key Details** cards.
  - When `aiGeneratedMiddleSection` is omitted, empty, or falsy, fall back seamlessly to the existing static generation logic for the **Condition** and **Key Details** cards.

### 3.2 Forwarding in `listingCopyGenerator.js`
- **File**: [outpost/src/utils/listingCopyGenerator.js](file:///e:/TechTrekGT/outpost/src/utils/listingCopyGenerator.js)
- **Update `generateEbayCopy(item, options = {})`**:
  - Pass `aiGeneratedMiddleSection: options.aiGeneratedMiddleSection || item.aiGeneratedMiddleSection || ''` into `generateEbayListingHtml(...)` so both `insertHtml` and `htmlBody` automatically reflect the AI-generated middle section when present, or fall back to static HTML when absent.

---

## 4. Frontend Implementation (React UI)

### 4.1 AI Generation Trigger & State in `ListingCopyModal.jsx`
- **File**: [outpost/src/components/ListingCopyModal.jsx](file:///e:/TechTrekGT/outpost/src/components/ListingCopyModal.jsx)
- **New State Hooks**:
  - `aiGeneratedMiddleSection` (`useState('')`): Stores the AI-generated HTML block for the active item session (reset when `item` changes or modal re-opens).
  - `generatingAiDetails` (`useState(false)`): Tracks in-flight request status.
  - `aiDetailsMsg` (`useState(null)`): Stores non-blocking status feedback (`{ type: 'success' | 'error', text: string }`).
- **UI Trigger Button**:
  - Add an **"Auto-Generate AI Description"** button with the `Sparkles` icon (and `Loader2` spinner when `generatingAiDetails` is true) in the eBay listing staging/editor area and eBay preview toolbar of `ListingCopyModal.jsx`.
  - Provide a secondary **"Reset to Static"** button when `aiGeneratedMiddleSection` is active so the user can revert to the static template at any time.
- **Handler (`handleGenerateAiDetails`) & AUDIT-004 Compliance**:
  - Sets `setGeneratingAiDetails(true)` and clears `setAiDetailsMsg(null)`.
  - Calls `generateAiEbayDetails({ title: title || item.item_name, brand, productType, condition, conditionHeader, conditionSubheader, notes: description || item.notes, specs, features })`.
  - Validates response (`if (!data || data.success === false || !data.html) throw new Error(...)`).
  - On success: updates `setAiGeneratedMiddleSection(data.html)`, switches preview to `html_preview` if currently on plain text, and sets a non-blocking emerald success banner.
  - On error: catches the error, leaves `aiGeneratedMiddleSection` untouched (preserving fallback behavior), and displays a non-blocking rose error banner (`setAiDetailsMsg({ type: 'error', text: err.message })`).
  - In `finally {}`: unconditionally calls `setGeneratingAiDetails(false)` to guarantee button recovery (AUDIT-004).
- **Memo Dependency Integration**:
  - Pass `aiGeneratedMiddleSection` into `generateEbayCopy(item, options)` inside the `generated` `useMemo` hook so the live HTML Preview and Raw HTML code tabs update immediately upon generation.

---

## 5. Verification & Post-Flight Documentation Plan

1. **Unit & Integration Tests**:
   - Verify route compilation and non-shadowing in `src/worker.js`.
   - Test `generateEbayListingHtml` with and without `aiGeneratedMiddleSection` to confirm exact injection and static fallback.
2. **Build & Deploy Loop (After Approval)**:
   - Execute `npm run build` in `e:\TechTrekGT\outpost`.
   - Execute `npm run deploy` and verify live Cloudflare Worker deployment.
3. **Documentation Synchronization (After Approval)**:
   - Update [outpost/docs/03_features.md](file:///e:/TechTrekGT/outpost/docs/03_features.md) and [outpost/docs/04_state.md](file:///e:/TechTrekGT/outpost/docs/04_state.md) to record the new `/api/ai/generate-ebay-details` endpoint, `ListingCopyModal` AI state, and `ebayTemplate.js` fallback architecture.

