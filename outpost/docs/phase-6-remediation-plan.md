# Phase 6 Remediation Plan

## Goal Description
Implement surgical remediations for the TechTrekGT Outpost backend to resolve database concurrency limits and patch the webhook authentication gap, based on the findings from the Phase 6 Audit Report.

## User Review Required
Please review the proposed changes to ensure they align with the expected behavior.

## Open Questions
> [!WARNING]
> **User ID Association for Webhooks**: In `functions/api/import/amazon.js`, if a request is authenticated via the `X-VineScout-Auth` secret key instead of a user's Bearer token (`amazon_api_token`), we bypass the `users` table lookup. However, a `userId` is still required to insert records into `auction_invoices` and `auction_items`. Should the payload include a `userId`, should it fall back to a specific admin user, or should it use a default system user ID? 

## Proposed Changes

---

### Outpost Backend API

#### [MODIFY] [analytics.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/analytics.js)
- **Target**: `onRequestPost` function (eBay traffic ingestion).
- **Change**: Replace the sequential database execution (`await env.DB.prepare(...).run()`) inside the `for...of` data points loop with an array that accumulates prepared statements. After the loop completes, invoke `await env.DB.batch(statements)` to execute the inserts concurrently. This optimization honors Cloudflare D1's single-writer limits.

#### [MODIFY] [amazon.js](file:///e:/TechTrekGT/outpost/functions/api/import/amazon.js)
- **Target**: `onRequestPost` function (Amazon VineScout import).
- **Change**: Update the authentication logic to look for the `X-VineScout-Auth` header. The logic will strictly compare this header against `env.OUTPOST_SECRET_KEY`. 
  - If a valid `X-VineScout-Auth` header matches, authentication passes.
  - If it does not match (or is missing), it will fall back to the existing `amazon_api_token` Bearer auth check.
  - If both fail, it will return a `401 Unauthorized`.

## Verification Plan
- Verify the build via `npm run build` inside `outpost/`.
- Visually inspect the generated `dist` and worker bundle to ensure no syntax errors were introduced.
- Confirm the changes use ESM JavaScript exclusively with no TypeScript dependencies.
