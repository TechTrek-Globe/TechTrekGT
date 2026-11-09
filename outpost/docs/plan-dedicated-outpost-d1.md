# Implementation Plan: Dedicated Cloudflare D1 Database for Outpost Tracker (`outpost-db`)

## Executive Summary & Problem Statement

Outpost Tracker (`e:/TechTrekGT/outpost/`) currently binds the shared Cloudflare D1 SQLite database `personal-budget-db` (`10f220d4-1c10-49e9-b63e-5d4cb08d599f`) via the `env.DB` Worker binding. To decouple Outpost from the shared platform database, isolate single-writer SQLite lock contention, and track D1 row-read/write quota metrics independently, Outpost will be migrated to a dedicated Cloudflare D1 instance named **`outpost-db`**.

The Worker binding name (`"binding": "DB"`) will remain strictly unchanged so that all existing serverless API handlers (`env.DB`) in `outpost/src/worker.js` and `outpost/functions/api/**` continue to operate with zero query logic rewrites.

---

## 1. Database Creation (Windows PowerShell)

Provision the new dedicated Cloudflare D1 database instance using the Wrangler CLI from the `outpost` project directory in Windows PowerShell:

```powershell
Set-Location -Path "e:\TechTrekGT\outpost"
npx wrangler d1 create outpost-db
```

### Expected CLI Output & UUID Capture
Wrangler will provision the remote database on Cloudflare edge and output a configuration block containing the newly generated `database_id` UUID:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "outpost-db",
      "database_id": "<NEW_OUTPOST_DATABASE_UUID>"
    }
  ]
}
```

Record `<NEW_OUTPOST_DATABASE_UUID>` from the terminal output for Step 2.

---

## 2. Configuration Update (`wrangler.jsonc` / `wrangler.toml`)

> **Configuration File Note**: In `e:/TechTrekGT/outpost/`, the active Wrangler configuration file on disk is [wrangler.jsonc](file:///e:/TechTrekGT/outpost/wrangler.jsonc) (referenced in the prompt as `wrangler.toml`). Both the JSONC format used by `wrangler.jsonc` and the equivalent TOML syntax are detailed below.

### 2.1 Exact Changes to [outpost/wrangler.jsonc](file:///e:/TechTrekGT/outpost/wrangler.jsonc#L47-L53)
Update the `d1_databases` array so `database_name` is set to `"outpost-db"` and `database_id` is set to the new UUID returned in Step 1, while preserving `"binding": "DB"`:

```diff
   "d1_databases": [
     {
       "binding": "DB",
-      "database_name": "personal-budget-db",
-      "database_id": "10f220d4-1c10-49e9-b63e-5d4cb08d599f"
+      "database_name": "outpost-db",
+      "database_id": "<NEW_OUTPOST_DATABASE_UUID>"
     }
   ],
```

*(If represented in `wrangler.toml` syntax, the equivalent `[[d1_databases]]` block is)*:
```toml
[[d1_databases]]
binding = "DB"
database_name = "outpost-db"
database_id = "<NEW_OUTPOST_DATABASE_UUID>"
```

### 2.2 NPM Migration Scripts Update in [outpost/package.json](file:///e:/TechTrekGT/outpost/package.json#L11-L12)
Update the convenience migration scripts in `outpost/package.json` to target `outpost-db`:

```diff
-    "db:migrate": "wrangler d1 execute personal-budget-db --remote --file=./auction-schema.sql",
-    "db:migrate:local": "wrangler d1 execute personal-budget-db --local --file=./auction-schema.sql",
+    "db:migrate": "wrangler d1 execute outpost-db --remote --file=./auction-schema.sql",
+    "db:migrate:local": "wrangler d1 execute outpost-db --local --file=./auction-schema.sql",
```

---

## 3. Schema Initialization & Prerequisite Base Tables

### 3.1 Schema Prerequisite Analysis (`users` & Base Schema vs. Additive `ALTER TABLE` Statements)
An audit of [outpost/auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql) reveals two critical schema initialization requirements when executing against a brand-new, empty D1 database (`outpost-db`):

1. **Parent `users` Table Prerequisite**:
   - `auction_invoices`, `auction_items`, `auction_sales`, `auction_comps`, `auction_platforms`, `auction_supplies`, `ebay_oauth_tokens`, `ebay_fee_reconciliations`, `auction_item_analytics`, `market_comps`, `listing_traffic`, `outpost_sync_settings`, `api_integrations`, `email_verifications`, `ebay_listings_cache`, and `outpost_sync_history` all declare `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`.
   - Furthermore, Outpost's auth and integration handlers ([register.js](file:///e:/TechTrekGT/outpost/functions/api/auth/register.js), [login.js](file:///e:/TechTrekGT/outpost/functions/api/auth/login.js), [me.js](file:///e:/TechTrekGT/outpost/functions/api/auth/me.js), [update-profile.js](file:///e:/TechTrekGT/outpost/functions/api/auth/update-profile.js), [reset-password.js](file:///e:/TechTrekGT/outpost/functions/api/auth/reset-password.js), [amazon-token.js](file:///e:/TechTrekGT/outpost/functions/api/import/amazon-token.js), [apiIntegrations.js](file:///e:/TechTrekGT/outpost/functions/utils/apiIntegrations.js), and [admin/stats.js](file:///e:/TechTrekGT/outpost/functions/api/admin/stats.js)) query the `users` table directly on `env.DB`.
   - In `personal-budget-db`, `users` was created prior to running `auction-schema.sql`. Therefore, `CREATE TABLE IF NOT EXISTS users (...)` must be present at the top of [outpost/auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql) so `outpost-db` is self-contained.

2. **Consolidated Base Table Definitions vs. Historical `ALTER TABLE` Statements**:
   - As noted on line 383 of [outpost/auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql#L383-L384) (`NOTE: Execute ALTER TABLE statements individually; SQLite D1 does not support transactional DDL mixing ALTER TABLE + CREATE TABLE in one batch`), `auction-schema.sql` contains both the initial `CREATE TABLE IF NOT EXISTS` definitions and historical Phase 3-8 `ALTER TABLE ... ADD COLUMN` statements (`ebay_listing_id`, `sku`, `attributes`, `import_batch_id`, `last_ebay_sync_status`, etc.), plus a duplicate `CREATE UNIQUE INDEX IF NOT EXISTS idx_auction_sales_item_unique` at lines 138 and 552.
   - Incorporating all Phase 3-8 columns directly into the `CREATE TABLE IF NOT EXISTS` definitions in `outpost/auction-schema.sql` (and commenting or removing redundant `ALTER TABLE` statements for columns already defined in the `CREATE TABLE` body) allows `wrangler d1 execute outpost-db --file=./auction-schema.sql` to succeed cleanly in a single atomic execution on both `--local` and `--remote`.

### 3.2 Wrangler CLI Commands for Schema Initialization (Windows PowerShell)

Execute the following PowerShell commands from `e:\TechTrekGT\outpost` to initialize both the **local** development SQLite state and the **remote** production Cloudflare D1 database:

```powershell
# 1. Navigate to the Outpost workspace directory
Set-Location -Path "e:\TechTrekGT\outpost"

# 2. Initialize the LOCAL D1 database (for wrangler dev / local testing)
npx wrangler d1 execute outpost-db --local --file=./auction-schema.sql

# 3. Verify local tables were created
npx wrangler d1 execute outpost-db --local --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# 4. Initialize the REMOTE Cloudflare D1 database (production)
npx wrangler d1 execute outpost-db --remote --file=./auction-schema.sql

# 5. Verify remote tables were created
npx wrangler d1 execute outpost-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

### 3.3 Optional Data Migration Commands (Existing Outpost Records from `personal-budget-db` to `outpost-db`)
If existing production user accounts, inventory (`auction_items`), invoices (`auction_invoices`), sales (`auction_sales`), and eBay OAuth tokens (`ebay_oauth_tokens`) need to be carried over from `personal-budget-db` into `outpost-db`, run the following PowerShell export/import sequence before cutover:

```powershell
Set-Location -Path "e:\TechTrekGT\outpost"

# Export relevant tables from personal-budget-db
npx wrangler d1 export personal-budget-db --remote --output=./backups/outpost-migration-export.sql `
  --table=users `
  --table=email_verifications `
  --table=password_resets `
  --table=auction_invoices `
  --table=auction_items `
  --table=auction_sales `
  --table=auction_comps `
  --table=auction_platforms `
  --table=auction_supplies `
  --table=auction_market_alerts `
  --table=ebay_oauth_tokens `
  --table=ebay_webhook_events `
  --table=ebay_fee_reconciliations `
  --table=auction_item_analytics `
  --table=market_comps `
  --table=listing_traffic `
  --table=outpost_sync_settings `
  --table=outpost_sync_history `
  --table=api_integrations `
  --table=ebay_listings_cache

# Execute the exported data against the new outpost-db
npx wrangler d1 execute outpost-db --remote --file=./backups/outpost-migration-export.sql
```

---

## 4. Codebase & Documentation Audit (`personal-budget-db` References)

A full-workspace search across `e:/TechTrekGT/outpost/` and root `e:/TechTrekGT/docs/` identified every file containing hardcoded references to `personal-budget-db` or its UUID (`10f220d4-1c10-49e9-b63e-5d4cb08d599f`).

### 4.1 Outpost Configuration & Package Files
| File Path | Line(s) | Current Reference | Planned Edit |
| :--- | :--- | :--- | :--- |
| [outpost/wrangler.jsonc](file:///e:/TechTrekGT/outpost/wrangler.jsonc#L47-L53) | 50-51 | `"database_name": "personal-budget-db"`, `"database_id": "10f220d4-1c10-49e9-b63e-5d4cb08d599f"` | Update `database_name` to `"outpost-db"` and `database_id` to `<NEW_OUTPOST_DATABASE_UUID>`. Keep `"binding": "DB"`. |
| [outpost/package.json](file:///e:/TechTrekGT/outpost/package.json#L11-L12) | 11-12 | `"db:migrate": "wrangler d1 execute personal-budget-db --remote --file=./auction-schema.sql"` (and `:local`) | Replace `personal-budget-db` with `outpost-db` in both `db:migrate` and `db:migrate:local`. |
| [outpost/auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql#L3) | 3 | `-- Adds auction_* tables to the shared personal-budget-db alongside Finance tables.` | Update header comment to reference dedicated `outpost-db` and include `CREATE TABLE IF NOT EXISTS users` + consolidated base schema. |
| [outpost/migrations/0009_roi_pct_fraction.sql](file:///e:/TechTrekGT/outpost/migrations/0009_roi_pct_fraction.sql#L35) | 35 | `-- APPLY WITH: npx wrangler d1 execute personal-budget-db --remote --file=./migrations/0009_roi_pct_fraction.sql` | Update comment to `outpost-db`. |

### 4.2 Outpost CLI Utility Scripts (`outpost/scripts/*.js`)
These four administrative Node.js CLI utilities invoke `npx wrangler d1 execute personal-budget-db` via `child_process.execSync`:

| File Path | Line(s) | Current Reference | Planned Edit |
| :--- | :--- | :--- | :--- |
| [outpost/scripts/check-legacy-hashes.js](file:///e:/TechTrekGT/outpost/scripts/check-legacy-hashes.js#L26) | 26 | ``const cmd = `npx wrangler d1 execute personal-budget-db ${remoteFlag} --command="${escapedSql}"`;`` | Replace `personal-budget-db` with `outpost-db`. |
| [outpost/scripts/manage-integrations.js](file:///e:/TechTrekGT/outpost/scripts/manage-integrations.js#L25) | 25 | ``const cmd = `npx wrangler d1 execute personal-budget-db ${remoteFlag} --command="${escapedSql}"`;`` | Replace `personal-budget-db` with `outpost-db`. |
| [outpost/scripts/migrate-amazon-tokens.js](file:///e:/TechTrekGT/outpost/scripts/migrate-amazon-tokens.js#L30) | 30 | ``const cmd = `npx wrangler d1 execute personal-budget-db ${remoteFlag} --command="${escapedSql}"`;`` | Replace `personal-budget-db` with `outpost-db`. |
| [outpost/scripts/migrate-ebay-tokens.js](file:///e:/TechTrekGT/outpost/scripts/migrate-ebay-tokens.js#L60) | 60 | ``const cmd = `npx wrangler d1 execute personal-budget-db ${remoteFlag} --command="${escapedSql}"`;`` | Replace `personal-budget-db` with `outpost-db`. |

### 4.3 Outpost UI & API Handler Comments (Zero Query Logic Changes)
| File Path | Line(s) | Current Reference | Planned Edit |
| :--- | :--- | :--- | :--- |
| [outpost/src/components/SettingsView.jsx](file:///e:/TechTrekGT/outpost/src/components/SettingsView.jsx#L1464) | 1464 | `Cloudflare D1 (personal-budget-db)` (Static UI status label in Profile/Account tab) | Update display text to `Cloudflare D1 (outpost-db)`. |
| [outpost/functions/api/ebay/oauth-status.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/oauth-status.js#L7) | 7 | `* directly from D1 (personal-budget-db).` (JSDoc comment only) | Update JSDoc comment to `D1 (outpost-db)`. Zero changes to SQL or handler code. |

### 4.4 Central Gateway Cross-App Consideration (`landing/`)
During the audit, we also checked [landing/wrangler.jsonc](file:///e:/TechTrekGT/landing/wrangler.jsonc#L19-L25) and `landing/src/gateway/`:
- `landing/src/gateway/ebayOAuth.js`, `landing/src/gateway/ebayWebhook.js`, `landing/src/gateway/ebayFinances.js`, and `landing/src/gateway/ebayListings.js` read/write `ebay_oauth_tokens`, `ebay_webhook_events`, `auction_items`, and `auction_sales`.
- Note: Outpost also has its own native `/api/ebay/webhook`, `/api/ebay/oauth-status`, `/api/ebay/active-listings`, `/api/ebay/reconcile`, and `/api/ebay/sync-*` endpoints inside `outpost/functions/api/ebay/`, while the eBay OAuth handshake (`GET /api/ebay/oauth/start`, `GET /api/ebay/oauth/callback`, `DELETE /api/ebay/oauth/disconnect`) and `/api/ebay/finances` live on the Landing Gateway (`techtrek-landing`).
- If `techtrek-landing` continues to handle eBay OAuth callbacks or finances proxies for Outpost, `landing/wrangler.jsonc` should either:
  - Bind `outpost-db` (e.g., as `DB` if Landing only uses D1 for Outpost's eBay gateway tables, or as a secondary D1 binding `OUTPOST_DB`), **OR**
  - Outpost's `ebayOAuth` / `ebayFinances` routes should use `outpost-db`.
  - *(Verified: in `landing/src/gateway/`, `env.DB` is ONLY used by `ebayOAuth.js`, `ebayWebhook.js`, `ebayFinances.js`, and `ebayListings.js` — no other Landing gateway files use `env.DB`! Thus updating `landing/wrangler.jsonc` `d1_databases` to `outpost-db` or binding `outpost-db` keeps eBay OAuth & Webhooks 100% synchronized with Outpost without any code changes).*

### 4.5 Distributed Documentation Files (`01_identity.md` - `04_state.md`)
Per the Workspace Documentation Sync Mandate, the following documentation files will be updated upon implementation completion:

| File Path | Line(s) | Planned Documentation Update |
| :--- | :--- | :--- |
| [outpost/docs/02_arch.md](file:///e:/TechTrekGT/outpost/docs/02_arch.md#L151-L156) | 151-156 | Update Section 5 (Database Infrastructure & Persistence Bindings) to document `DB` mapped to dedicated `outpost-db` (with new UUID) and migration command `wrangler d1 execute outpost-db --file=./auction-schema.sql`. |
| [outpost/docs/03_features.md](file:///e:/TechTrekGT/outpost/docs/03_features.md) | Append section | Document the dedicated `outpost-db` database isolation architecture and quota decoupling. |
| [outpost/docs/04_state.md](file:///e:/TechTrekGT/outpost/docs/04_state.md#L103) | 103, Append | Note historical audit on `personal-budget-db` vs active state on dedicated `outpost-db`. |
| [docs/02_arch.md](file:///e:/TechTrekGT/docs/02_arch.md#L63-L88) | 63-88 | Update Section 3 to reflect that Outpost Tracker uses its own dedicated D1 database (`outpost-db`) while Finance, Wayfinder, etc. use `personal-budget-db`. |
| [docs/03_features.md](file:///e:/TechTrekGT/docs/03_features.md#L168-L173) | 168-173 | Update Section 9 to reflect Outpost's dedicated `outpost-db` write-budget isolation. |
| [docs/04_state.md](file:///e:/TechTrekGT/docs/04_state.md#L5-L51) | 5, 51, 205 | Update Section 1 and Section 1.3 to record Outpost Tracker's dedicated `outpost-db` instance. |

---

## 5. Verification & Post-Approval Execution Sequence

Once the user responds with `Plan approved`, execution will proceed in this exact order:
1. Run `npx wrangler d1 create outpost-db` in `e:\TechTrekGT\outpost` and capture the new `database_id`.
2. Update `outpost/wrangler.jsonc`, `outpost/package.json`, `outpost/auction-schema.sql`, `outpost/scripts/*.js`, `outpost/src/components/SettingsView.jsx`, and `outpost/functions/api/ebay/oauth-status.sql` (comment).
3. Initialize `outpost-db` locally (`--local`) and remotely (`--remote`) using `auction-schema.sql` (and migrate existing Outpost data from `personal-budget-db` if desired).
4. Run `npm test` (`node --test tests/*.test.js`) in `e:\TechTrekGT\outpost` to verify all unit and integration tests pass.
5. Synchronize `outpost/docs/02_arch.md`, `outpost/docs/03_features.md`, `outpost/docs/04_state.md`, and root `docs/02_arch.md`, `docs/03_features.md`, `docs/04_state.md`.
6. Execute `npm run build` and `npm run deploy` in `e:\TechTrekGT\outpost` to verify a zero-error build and live Cloudflare Worker deployment.

