# Implementation Plan: Import History Archive & Non-Vine Invoice Cost vs. Sold Net Standing

## 1. Executive Summary & Workspace Findings

### 1.1 Current State (What Exists)
- **Database & Bindings (`outpost/wrangler.jsonc`, `outpost/auction-schema.sql`)**:
  - Outpost uses dedicated Cloudflare D1 database `outpost-db` (`env.DB`), KV (`RATE_LIMIT_KV`), and Durable Object (`RATE_LIMIT_DO`). There is **no R2 bucket binding** in `wrangler.jsonc`.
  - `auction_invoices`, `auction_items`, `auction_sales`, and `auction_comps` each have an `import_batch_id TEXT` column (added in the T-02 migration) used during `POST /api/import/batch` for failure rollback (`cleanupBatch`) and `replace` strategy cleanup.
  - `auction_items` has an indexed `is_vinescout INTEGER NOT NULL DEFAULT 0` column (Migration 0010), along with `etv REAL`, `tax_cost REAL`, and `attributes TEXT` JSON (`source: 'amazon_vinescout'`, `vine_program: true`).
  - `auction_sales` stores realized transaction totals (`gross_sale_price`, `buyer_shipping_paid`, `actual_shipping_cost`, `platform_fees_amt`, `payment_processing_amt`, `promoted_listing_fee`, `net_proceeds`, `true_total_cost`, `net_profit`, `cogs_source`).
- **Import & Invoice Handlers (`functions/api/import/`, `functions/api/invoices/`)**:
  - `SpreadsheetImporterModal.jsx` parses `.pdf` (`pdfInvoiceParser.js`) and `.xlsx`/`.xls`/`.csv` (`spreadsheetWorkerClient.js`) files **transiently in the browser** and sends only parsed JSON to `POST /api/import/batch`.
  - `POST /api/import/amazon` sets `is_vinescout = 1` and `attributes.source = 'amazon_vinescout'`.
  - `POST /api/import/amazon-url` sets `attributes.source = 'amazon_url'` and `vine_program: false` (`is_vinescout` defaults to `0`).
  - `GET /api/invoices` and `GET /api/invoices/:id` (`ViewInvoiceModal.jsx`) return invoice headers and line items.
- **Dashboard & Analytics (`functions/api/dashboard.js`, `src/components/DashboardView.jsx`)**:
  - Aggregates portfolio KPIs across **all** items and sales combined.

### 1.2 Gaps (What Is Missing)
1. **No Import Batch Metadata or File Storage**: `import_batch_id` is a bare UUID on child rows. Original filenames, file types, upload timestamps, batch summaries, and raw PDF/XLS/CSV file bytes are discarded after client-side parsing.
2. **No Import History API or UI**: There is no `GET /api/import/batches` or file retrieval endpoint, and no UI archive to browse past imports or preview/download historical PDFs and spreadsheets.
3. **No Non-Vine Cost vs. Sold Net Standing View**: Neither `GET /api/dashboard` nor `GET /api/sales` isolates `is_vinescout = 0` (paid invoice items) from `is_vinescout = 1` (Amazon VineScout items) to compare total non-Vine invoice spend against realized non-Vine sold net payouts.
4. **Minor Tagging Edge Case (`functions/api/items/[id].js`)**: Line 428 sets `is_vinescout = 1` whenever `nextAttrs.asin` is truthy during item updates, which could misclassify non-Vine `amazon_url` items if edited.

---

## 2. Phased Implementation Plan

### Phase 1: D1 Schema & Migration (`outpost/migrations/0013_import_batches_and_files.sql`)

Because `outpost/wrangler.jsonc` has no R2 binding, raw uploaded files will be stored in `outpost-db` using chunked storage (512 KB chunks) to stay safely below Cloudflare D1's 1 MB bound-parameter and 2 MB row limits.

1. **Create `import_batches` table**:
   - Columns:
     - `id TEXT PRIMARY KEY` (matches `import_batch_id` UUID)
     - `user_id TEXT NOT NULL` (FK to `users(id)` ON DELETE CASCADE)
     - `source_type TEXT NOT NULL` (`'pdf' | 'xlsx' | 'xls' | 'csv' | 'manual_batch' | 'legacy_batch'`)
     - `file_name TEXT`
     - `mime_type TEXT`
     - `file_size INTEGER NOT NULL DEFAULT 0`
     - `file_sha256 TEXT`
     - `strategy TEXT NOT NULL DEFAULT 'append'` (`'append' | 'replace'`)
     - `invoice_count INTEGER NOT NULL DEFAULT 0`
     - `item_count INTEGER NOT NULL DEFAULT 0`
     - `sale_count INTEGER NOT NULL DEFAULT 0`
     - `comp_count INTEGER NOT NULL DEFAULT 0`
     - `total_cost_basis REAL NOT NULL DEFAULT 0.0`
     - `has_file_blob INTEGER NOT NULL DEFAULT 0`
     - `status TEXT NOT NULL DEFAULT 'completed'` (`'completed' | 'rolled_back'`)
     - `created_at TEXT NOT NULL DEFAULT (datetime('now'))`
   - Index: `CREATE INDEX IF NOT EXISTS idx_import_batches_user_created ON import_batches(user_id, created_at DESC);`

2. **Create `import_batch_file_chunks` table**:
   - Columns:
     - `batch_id TEXT NOT NULL` (FK to `import_batches(id)` ON DELETE CASCADE)
     - `chunk_index INTEGER NOT NULL`
     - `data TEXT NOT NULL` (base64-encoded 512 KB slice, avoiding SQLite BLOB JSON serialization quirks in D1 REST/binding layers)
     - `PRIMARY KEY (batch_id, chunk_index)`

3. **Add Indexes for Batch Lookups**:
   - `CREATE INDEX IF NOT EXISTS idx_auction_invoices_batch ON auction_invoices(user_id, import_batch_id) WHERE import_batch_id IS NOT NULL;`
   - `CREATE INDEX IF NOT EXISTS idx_auction_items_batch ON auction_items(user_id, import_batch_id) WHERE import_batch_id IS NOT NULL;`

4. **Legacy Backfill Strategy**:
   - Include an idempotent `INSERT OR IGNORE INTO import_batches (...)` statement in migration `0013` that scans distinct non-null `import_batch_id` values in `auction_invoices` and `auction_items`, synthesizing `source_type = 'legacy_batch'`, `has_file_blob = 0`, and aggregated counts/`total_cost_basis` so historical batches appear immediately in the Import History archive with their linked invoices and items.
   - Sync `outpost/auction-schema.sql` with the new tables and indexes.

---

### Phase 2: Worker API Endpoints & Ingestion Updates

All handlers will live under `outpost/functions/api/`, register in `outpost/src/worker.js` with `auth: 'session'`, use positional `?` bindings (`.bind()`), and enforce `user_id = ?` tenant isolation.

1. **Extend `POST /api/import/batch` (`functions/api/import/batch.js`)**:
   - Accept an optional `file` metadata object in the JSON body: `{ name, mime_type, size, source_type, sha256, content_base64 }`.
   - Enforce a maximum file size guard (e.g., 10 MB decoded / ~13.5 MB base64) so Worker memory and D1 row quotas are protected; if omitted or oversized, still persist the `import_batches` metadata row with `has_file_blob = 0`.
   - Compute `total_cost_basis` from the imported items/invoices (`round2`).
   - Split `content_base64` into ~512 KB base64-aligned chunks (`524288` chars, multiple of 4) and insert into `import_batches` + `import_batch_file_chunks` using `env.DB.batch()` in `CHUNK_SIZE` batches.
   - Update `cleanupBatch(db, batchId, userId)` so any failure rolls back `import_batch_file_chunks` and `import_batches` alongside `auction_comps`, `auction_sales`, `auction_items`, and `auction_invoices`.
   - Return `import_batch_id` in the `200 OK` response payload.

2. **New Import History Endpoints (`functions/api/import/batches.js` & `functions/api/import/batches/[id].js` & `functions/api/import/batches/[id]/file.js`)**:
   - `GET /api/import/batches`: Paginated list (`?page=1&limit=25`) of `import_batches` for `user_id = ?`, ordered by `created_at DESC`, including a comma-joined preview of `invoice_refs` from `auction_invoices`.
   - `GET /api/import/batches/:id`: Returns the `import_batches` record plus linked `auction_invoices` and `auction_items` (with VineScout vs. non-Vine flags) for `user_id = ?`.
   - `GET /api/import/batches/:id/file`: Verifies ownership (`user_id = ?`), queries `import_batch_file_chunks` ordered by `chunk_index ASC`, decodes base64 chunks into a `Uint8Array`, and responds with:
     - `Content-Type`: validated `mime_type` (`application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-excel`, or `text/csv`).
     - `Content-Disposition`: `inline; filename="..."` for PDFs (allowing in-browser/modal preview) or `attachment; filename="..."` for spreadsheets (or `?download=1` override).
     - `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.

3. **New Non-Vine Cost vs. Sold P&L Endpoint (`functions/api/reports/non-vine-pnl.js`) + `GET /api/dashboard` Summary**:
   - **Fix Tagging Edge Case (`functions/api/items/[id].js`)**: Update line 428 so `is_vinescout` is derived strictly from `nextAttrs.is_vinescout || nextAttrs.source === 'amazon_vinescout' || nextAttrs.vine_program === true` (removing bare `nextAttrs.asin` check so paid `amazon_url` items are not misclassified).
   - **Canonical Non-Vine Predicate**:
     `i.is_vinescout = 0 AND COALESCE(json_extract(i.attributes, '$.source'), '') != 'amazon_vinescout'`
   - **Endpoint `GET /api/reports/non-vine-pnl` (`?range=all|ytd|90d|30d`)**:
     Execute batched D1 SQL aggregations (`env.DB.batch([...])`) for `user_id = ?`:
     1. **Non-Vine Invoice Spend (COGS / Acquisition Cost)**:
        - `total_non_vine_spend`: `SUM(CASE WHEN i.status != 'Returned' THEN i.true_total_cost ELSE 0 END)`
        - `sold_non_vine_cogs`: `SUM(CASE WHEN i.status = 'Sold' THEN i.true_total_cost ELSE 0 END)`
        - `active_non_vine_capital`: `SUM(CASE WHEN i.status IN ('Available', 'Listed', 'Draft', 'Unsold') THEN i.true_total_cost ELSE 0 END)`
        - `kept_non_vine_cost`: `SUM(CASE WHEN i.status = 'Kept for Self' THEN i.true_total_cost ELSE 0 END)`
        - `non_vine_item_count` and `non_vine_invoice_count` (`COUNT(DISTINCT i.invoice_id)`).
     2. **Non-Vine Sold Totals (Joined `auction_sales s JOIN auction_items i ON s.item_id = i.id`)**:
        - `sold_count`: `COUNT(s.id)`
        - `gross_sales`: `SUM(s.gross_sale_price)`
        - `buyer_shipping_paid`: `SUM(s.buyer_shipping_paid)`
        - `total_fees_and_shipping`: `SUM(s.platform_fees_amt + s.payment_processing_amt + s.promoted_listing_fee + s.actual_shipping_cost)`
        - `net_payouts`: `SUM(s.net_proceeds)` (cash received after fees and shipping labels)
        - `realized_sold_profit`: `SUM(s.net_profit)` (`net_payouts - sold_non_vine_cogs`)
     3. **Excluded VineScout Context**:
        - `excluded_vine_items`: count of items where `i.is_vinescout = 1`
        - `excluded_vine_sold_net_payouts`: `SUM(s.net_proceeds)` for VineScout sales (shown as a secondary informational pill so the user can verify separation).
     4. **Net Standing Calculations (rounded via `round2`)**:
        - `net_cash_standing = round2(net_payouts - total_non_vine_spend)`
          - Negative: remaining amount needed to break even on all non-Vine invoice purchases.
          - Zero or Positive: net cash ahead after covering 100% of non-Vine invoice costs.
        - `cost_recovery_pct = total_non_vine_spend > 0 ? round2((net_payouts / total_non_vine_spend) * 100) : 0`
   - Also embed a lightweight `non_vine_pnl` summary object in `GET /api/dashboard` so the main Dashboard loads in a single request without extra waterfall latency.

---

### Phase 3: React UI Components (Pure JS/JSX, Tailwind 3.4 Dark-Mode)

1. **API Client (`src/utils/auctionApi.js`)**:
   - Add `getImportBatches(page, limit)`, `getImportBatch(id)`, `getImportBatchFileUrl(id, download)`, and `getNonVinePnl(range)`.

2. **Capture Source File in `SpreadsheetImporterModal.jsx`**:
   - Retain the selected `file` `ArrayBuffer` (converted to base64 if `<= 10 MB`) and compute SHA-256 via `crypto.subtle.digest('SHA-256', buffer)`.
   - Include `file: { name, mime_type, size, source_type, sha256, content_base64 }` in the `POST /api/import/batch` body.
   - Add a header tab toggle inside `SpreadsheetImporterModal.jsx` (`Import File` | `Import History`) so users can switch straight to historical imports without adding extra top-level navigation clutter.

3. **Import History Archive (`src/components/ImportHistoryModal.jsx` or `ImportHistoryPanel.jsx`)**:
   - Accessible from:
     - The `Import History` tab inside `SpreadsheetImporterModal.jsx`.
     - A compact `History` icon button next to `Import` in `InventoryCommandBar.jsx`.
     - A `View Source File` button inside `ViewInvoiceModal.jsx` whenever `invoice.import_batch_id` has `has_file_blob === 1`.
   - Uses `fetchRequestIdRef` race guard and non-blocking inline error banners (zero `alert()`).
   - Features:
     - Paginated batch list showing date, filename, file-type badge (`PDF`, `XLSX`, `CSV`, `Legacy`), invoice/item counts, and total cost basis.
     - Expandable/split detail drawer showing linked invoices and items (with `VineScout` vs. `Paid Invoice` badges).
     - **File Viewer / Download**:
       - For PDFs with `has_file_blob === 1`: opens an inline modal `<iframe src={fileUrl} />` (fetched via `credentials: 'include'` or same-origin `/outpost/api/import/batches/:id/file`) with a "Open in New Tab" and "Download PDF" action.
       - For `.xlsx`/`.xls`/`.csv`: triggers direct download via `/outpost/api/import/batches/:id/file?download=1` and optionally renders a quick sheet summary from the linked D1 items.
       - For legacy batches (`has_file_blob === 0`): clearly displays `"Metadata only (uploaded before file archiving)"` alongside the linked invoice/item breakdown.

4. **Non-Vine Cost vs. Sold Net Standing Card (`src/components/dashboard/NonVinePnlCard.jsx`)**:
   - Mounted in `DashboardView.jsx` directly below the 6-card Executive KPI strip (spanning full width as a focused 2-column or 4-metric glassmorphic comparison panel).
   - Includes a compact range selector (`All Time`, `YTD`, `90d`, `30d`) guarded by `fetchRequestIdRef`.
   - Displays:
     - **Non-Vine Invoice Spend**: Total landed cost of non-Vine items (`Sold COGS` + `Active Unsold Capital` breakdown) with an explicit badge showing `X VineScout items excluded`.
     - **Non-Vine Sold Net Payouts**: Cash proceeds after marketplace fees and shipping labels (with Gross Sales and Fees/Labels sub-labels).
     - **Current Net Standing**: `Net Payouts - Non-Vine Invoice Spend`, styled Emerald (`+$X.XX Net Ahead`) when `>= 0` and Amber/Rose (`-$X.XX To Break Even`) when `< 0`, accompanied by a horizontal cost-recovery progress bar (`XX.X% recovered`).

---

### Phase 4: Verification & Documentation Sync

1. **Automated Tests (`outpost/tests/`)**:
   - Add unit/integration tests covering:
     - `import_batches` + `import_batch_file_chunks` persistence, chunk reassembly, and `cleanupBatch` rollback.
     - Tenant isolation (`user_id` scoping) on `GET /api/import/batches`, `:id`, and `:id/file`.
     - Non-Vine P&L SQL/math excluding `is_vinescout = 1` items and computing `net_cash_standing` accurately across sold, active, kept, and returned states.
2. **Build & Deploy**:
   - Run `npm run build` and `node --test tests/*.test.js` in `e:/TechTrekGT/outpost`, apply D1 migration `0013` locally and remotely, and deploy via `npm run deploy`.
3. **Post-Flight Documentation Sync**:
   - Update `outpost/docs/03_features.md` and `outpost/docs/04_state.md` (and `docs/04_state.md` if shared governance tables/counts change).
