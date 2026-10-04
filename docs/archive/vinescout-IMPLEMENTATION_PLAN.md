# [ARCHIVED] VScout Dual-System Platform - Implementation Plan

## Overview

This plan integrates VScout as a fifth first-class application in the TechTrekGT Cloudflare ecosystem, deployed at `techtrekgt.com/vinescout`. The architecture is a two-component system:

1. **Extension** (`e:/Vine/VineScout/`) - The existing Chrome MV3 ingestion and scraping engine, extended with a Cloudflare cloud-push bridge.
2. **Web App** (`e:/TechTrekGT/vinescout/`) - A new React 19 + Vite 6 + Tailwind SPA deployed as a Cloudflare Worker, sharing the `personal-budget-db` D1 instance with the existing TechTrekGT apps.

The plan is divided into four work tracks that must be executed in dependency order. Tracks 1 and 2 can proceed in parallel; Track 3 depends on Track 2; Track 4 depends on all three.

---

## Critical Pre-flight Context

> [!IMPORTANT]
> **Landing hub current state:** The VScout card in `landing/index.html` (lines 105-127) currently links to `https://sites.google.com/view/vine-scout/home` with `target="_blank"`. This entire card + footer link must be re-pointed to `https://techtrekgt.com/vinescout` and re-branded "VScout" before or during Track 4.

> [!IMPORTANT]
> **Outpost relationship:** Phase 6/7 of Outpost already ingests VScout items via `POST /outpost/api/import/amazon` and writes them into `auction_items.attributes`. The VScout web app is a **distinct, dedicated portal** for Vine-side analytics and is NOT a replacement for that Outpost ingestion pipeline. The two co-exist.

> [!IMPORTANT]
> **No TypeScript.** The web app uses plain JavaScript (JSX) only, matching the TechTrekGT convention (ARCHITECTURE.md section 15).

> [!WARNING]
> **D1 write-lock risk.** Adding VScout as a 5th writer on `personal-budget-db` increases write contention. All VScout batch writes must be debounced or chunked. Review ARCHITECTURE.md section 8.4 before any bulk import worker implementation.

---

## Open Questions

> [!IMPORTANT]
> **Q1 - VScout Worker name:** Following the pattern (`techtrek-budget`, `techtrek-outpost`, `techtrek-wayfinder`), the proposed worker name is `techtrek-vinescout`. Confirm or override.

> [!IMPORTANT]
> **Q2 - Dev port assignment:** Existing ports are 3000 (finance), 3001 (outpost), 5173 (bigworm), 5174 (wayfinder), 8787 (landing). Proposed VScout dev port: **5175**. Confirm or override. This port must also be added to `ALLOWED_ORIGINS` in `landing/src/worker.js`.

> [!IMPORTANT]
> **Q3 - Extension cloud-push trigger:** The extension background.js is already a 238KB module. Should the Cloudflare push be triggered on:
> (a) Every sync completion (alarms-driven, existing pattern), or
> (b) An explicit user action button in dashboard.html ("Push to Cloud")?
> Option (b) is recommended to avoid unexpected data uploads without user intent.

> [!IMPORTANT]
> **Q4 - Auth scope:** VScout web app will use the shared SSO (`users` table, shared `JWT_SECRET`). Should VScout have its own user registration/password reset pages, or require users to register via Finance first (same pattern as bigworm, which is auth-only)?

> [!IMPORTANT]
> **Q5 - Tax settings migration:** `popup.js` already implements the full tax reconciliation engine locally (SE tax, federal brackets, state configs). Should the new `vine_tax_settings` D1 table be a cloud-sync mirror of the local state, or should the web app re-implement tax config as its source of truth?

> [!IMPORTANT]
> **Q6 - VScout ASIN image cache:** The extension caches ASIN images in `chrome.storage.local` under `asin_images_cache`. Should image URLs be pushed to the Worker API alongside item data, or remain local-only?

---

## Proposed Changes

---

### Track 1: Extension Cloud Bridge (`e:/Vine/VineScout/`)

#### [MODIFY] [manifest.json](file:///e:/Vine/VineScout/manifest.json)

- Add `"https://techtrekgt.com/*"` and `"https://*.techtrekgt.com/*"` to `host_permissions` array (after line 48, before the closing bracket).
- Add `externally_connectable` key to allow the web app to call `chrome.runtime.sendMessage` into the extension:

```json
"externally_connectable": {
  "matches": [
    "https://techtrekgt.com/*"
  ]
}
```

> [!NOTE]
> No existing `host_permissions` entries are removed. This is a pure append.

#### [NEW] `src/services/cloudSync.js`

A new module in the existing `src/services/` directory. This module is responsible for the one-way push from extension to Cloudflare Worker. It must follow all existing VineScout rules:

- Pure vanilla JS (ES2020+), no imports of npm packages.
- Uses `readVineItems()` for all data access - never touches `chrome.storage.local` directly.
- Uses `fetchWithBackoff` pattern (12s AbortController, 3 retries) matching Stealth Fetch Protocol.
- Never stores the auth JWT in `localStorage`. Auth is cookie-based, requiring `credentials: 'include'`.
- Implements Gaussian delay between batched chunk writes (3-8s).

**Exported functions:**
```js
// Push a serializable batch of vine items to the Worker.
// Reads all chunks via readVineItems(), serializes, POSTs to
// https://techtrekgt.com/vinescout/api/vinescout/sync
// Returns { pushed: N, skipped: N, errors: [] }
export async function pushItemsToCloud(options = {});

// Push tax settings JSON to the Worker.
// Reads from chrome.storage.local settings key.
// POSTs to https://techtrekgt.com/vinescout/api/vinescout/tax
export async function pushTaxSettingsToCloud();
```

**Data contract (POST body to /api/vinescout/sync):**
```json
{
  "items": [
    {
      "asin": "B0XXXXXXXX",
      "title": "...",
      "etv": 29.99,
      "order_id": "123-4567890-1234567",
      "date_added": "2026-09-01T12:00:00Z",
      "category": "...",
      "image_url": "...",
      "review_written": false,
      "rating": null,
      "vine_category": "REGULAR",
      "marketplace": "amazon.com"
    }
  ],
  "client_version": "2.3.5",
  "pushed_at": "2026-09-14T23:00:00Z"
}
```

> [!NOTE]
> The extension does NOT store the auth token. The Worker must validate the `JWT_SECRET` SSO cookie via `credentials: 'include'`. If the user is not logged into techtrekgt.com, the push returns 401 and `cloudSync.js` surfaces the error gracefully via `vsLog()`.

#### [MODIFY] `src/background.js` (surgical, minimal)

- Import `cloudSync.js` via a dynamic `import()` or add a static import at the top.
- Add an alarm handler for `'vs-cloud-push'` that calls `pushItemsToCloud()` (gated behind Q3 decision - only wired if option (a) is chosen).
- If option (b) is chosen, expose a `chrome.runtime.onMessage` handler for a new `CLOUD_PUSH_REQUEST` action dispatched from `dashboard.html`.

> [!CAUTION]
> `background.js` is 238KB. Do NOT refactor, reorganize, or move any existing logic. Only append the new alarm handler and import at the appropriate boundaries. Zero-Touch Whitespace rule applies.

#### [MODIFY] `src/ui/dashboard.html` (surgical, conditional on Q3-b)

- Add a "Push to Cloud" button in the Cloud Sync section.
- The button dispatches `CLOUD_PUSH_REQUEST` via `chrome.runtime.sendMessage`.

---

### Track 2: D1 Database Schema (`personal-budget-db`)

#### [NEW] `e:/TechTrekGT/vinescout/vinescout-schema.sql`

New additive migration file following the exact pattern of `outpost/auction-schema.sql`. Uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` only. No `DROP`.

**`vine_items`** - Core scraped Vine item catalog:
```sql
CREATE TABLE IF NOT EXISTS vine_items (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  asin             TEXT NOT NULL,
  title            TEXT NOT NULL,
  etv              REAL NOT NULL DEFAULT 0.0,
  order_id         TEXT,
  date_added       TEXT,
  vine_category    TEXT,
  category         TEXT,
  marketplace      TEXT NOT NULL DEFAULT 'amazon.com',
  image_url        TEXT,
  review_written   INTEGER NOT NULL DEFAULT 0,
  rating           REAL,
  review_id        TEXT,
  review_date      TEXT,
  outpost_item_id  TEXT,
  outpost_liquidated INTEGER NOT NULL DEFAULT 0,
  sale_price       REAL,
  sold_at          TEXT,
  ebay_order_id    TEXT,
  attributes       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vine_items_user_asin ON vine_items(user_id, asin);
CREATE INDEX IF NOT EXISTS idx_vine_items_user     ON vine_items(user_id);
CREATE INDEX IF NOT EXISTS idx_vine_items_date     ON vine_items(user_id, date_added);
CREATE INDEX IF NOT EXISTS idx_vine_items_category ON vine_items(user_id, vine_category);
```

**`vine_orders`** - Amazon order history:
```sql
CREATE TABLE IF NOT EXISTS vine_orders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  order_id    TEXT NOT NULL,
  asin        TEXT,
  item_id     TEXT,
  order_date  TEXT,
  marketplace TEXT NOT NULL DEFAULT 'amazon.com',
  status      TEXT,
  etv         REAL,
  attributes  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vine_orders_user_order ON vine_orders(user_id, order_id);
CREATE INDEX IF NOT EXISTS idx_vine_orders_user ON vine_orders(user_id);
```

**`vine_tax_settings`** - Per-user tax config mirror:
```sql
CREATE TABLE IF NOT EXISTS vine_tax_settings (
  user_id              TEXT PRIMARY KEY,
  filing_status        TEXT NOT NULL DEFAULT 'single',
  state_code           TEXT,
  state_tax_type       TEXT,
  state_tax_rate       REAL,
  se_deduction_pct     REAL NOT NULL DEFAULT 0.5,
  se_tax_rate          REAL NOT NULL DEFAULT 0.153,
  use_qbi_deduction    INTEGER NOT NULL DEFAULT 1,
  custom_brackets_json TEXT,
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**`vine_asin_cache`** - Shared ASIN metadata cache:
```sql
CREATE TABLE IF NOT EXISTS vine_asin_cache (
  asin       TEXT PRIMARY KEY,
  title      TEXT,
  category   TEXT,
  image_url  TEXT,
  brand      TEXT,
  attributes TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  source     TEXT NOT NULL DEFAULT 'extension'
);
CREATE INDEX IF NOT EXISTS idx_vine_asin_cache_fetched ON vine_asin_cache(fetched_at);
```

**Migration commands:**
```powershell
# Local:
wrangler d1 execute personal-budget-db --file=./vinescout-schema.sql --local
# Production:
wrangler d1 execute personal-budget-db --file=./vinescout-schema.sql --remote
```

---

### Track 3: VScout Cloudflare Worker + Web App (`e:/TechTrekGT/vinescout/`)

Entire new project. Follows the standard TechTrekGT project layout (ARCHITECTURE.md section 3.1).

#### [NEW] Project directory scaffold

```
vinescout/
├── index.html
├── package.json
├── vite.config.js           # base: '/vinescout/', outDir: 'dist/client'
├── tailwind.config.js       # vs-* palette (dark-mode-first)
├── postcss.config.js
├── wrangler.jsonc            # techtrek-vinescout
├── vinescout-schema.sql
├── .dev.vars.example
├── src/
│   ├── main.jsx
│   ├── App.jsx               # custom router + providers
│   ├── worker.js             # Cloudflare Worker API layer
│   ├── index.css
│   ├── components/
│   │   ├── AppLayout.jsx
│   │   ├── AuthPage.jsx
│   │   ├── DashboardView.jsx
│   │   ├── ItemsView.jsx
│   │   ├── OrdersView.jsx
│   │   ├── TaxView.jsx
│   │   ├── SyncView.jsx
│   │   └── SettingsView.jsx
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── VScoutContext.jsx
│   └── utils/
│       ├── api.js
│       └── formatters.js
└── functions/
    ├── api/
    │   ├── auth/
    │   │   ├── login.js
    │   │   ├── logout.js
    │   │   └── me.js
    │   └── vinescout/
    │       ├── items.js
    │       ├── sync.js
    │       └── tax.js
    └── utils/
        ├── auth.js
        └── rateLimit.js
```

#### [NEW] `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "techtrek-vinescout",
  "main": "src/worker.js",
  "compatibility_date": "2026-08-01",
  "compatibility_flags": ["nodejs_compat"],
  "observability": { "enabled": true },
  "assets": {
    "directory": "./dist/client",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  },
  "routes": [
    { "pattern": "techtrekgt.com/vinescout",   "zone_name": "techtrekgt.com" },
    { "pattern": "techtrekgt.com/vinescout/*", "zone_name": "techtrekgt.com" }
  ],
  "d1_databases": [{
    "binding": "DB",
    "database_name": "personal-budget-db",
    "database_id": "10f220d4-1c10-49e9-b63e-5d4cb08d599f"
  }]
}
```

#### Worker API Endpoint Map

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| POST | `/api/auth/login` | `auth/login.js` | Public |
| POST | `/api/auth/logout` | `auth/logout.js` | Public |
| GET | `/api/auth/me` | `auth/me.js` | JWT |
| GET | `/api/vinescout/items` | `vinescout/items.js` | JWT |
| POST | `/api/vinescout/sync` | `vinescout/sync.js` | JWT |
| GET | `/api/vinescout/orders` | `vinescout/orders.js` | JWT |
| GET | `/api/vinescout/tax` | `vinescout/tax.js` | JWT |
| PUT | `/api/vinescout/tax` | `vinescout/tax.js` | JWT |
| GET | `/api/health` | inline | None |

**`GET /api/vinescout/items` query params:** `page`, `limit`, `category`, `reviewed`, `sort`, `dir`, `search`

**`POST /api/vinescout/sync` behavior:** `INSERT OR REPLACE INTO vine_items` using `(user_id, asin)` natural key. Hard limit: 500 items per POST to prevent D1 write-lock contention.

#### SPA Route Table

| Pathname | View |
|----------|------|
| `/vinescout` or `/vinescout/` | `DashboardView` |
| `/vinescout/items` | `ItemsView` |
| `/vinescout/orders` | `OrdersView` |
| `/vinescout/tax` | `TaxView` |
| `/vinescout/sync` | `SyncView` |
| `/vinescout/settings` | `SettingsView` |

#### `package.json` scripts
```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "npm run build && wrangler dev",
  "deploy": "npm run build && wrangler deploy",
  "db:migrate": "wrangler d1 execute personal-budget-db --file=./vinescout-schema.sql --remote",
  "db:migrate:local": "wrangler d1 execute personal-budget-db --file=./vinescout-schema.sql --local"
}
```

> [!NOTE]
> Secrets required (set via `wrangler secret put`): `JWT_SECRET` (must match the shared value used by all other TechTrekGT apps).

---

### Track 4: Landing Hub Update (`e:/TechTrekGT/landing/`)

#### [MODIFY] [landing/index.html](file:///e:/TechTrekGT/landing/index.html)

Three surgical edits to existing content:

1. **VScout card article (lines 105-127):**
   - `href`: `https://sites.google.com/view/vine-scout/home?authuser=0` -> `https://techtrekgt.com/vinescout`
   - `target="_blank" rel="noopener noreferrer"` -> `target="_self"`
   - Card tag text: "Vine Scout" -> "VScout"
   - Card `<h3>` title: "Vine Scout" -> "VScout"
   - CTA button text: "Launch Vine Scout" -> "Launch VScout"
   - Remove `<span class="external-badge">opens in new tab</span>`

2. **Footer nav link (line 165):**
   - `href`: Google Sites URL -> `https://techtrekgt.com/vinescout`
   - Link text: "Vine Scout" -> "VScout"
   - Remove `target="_blank" rel="noopener noreferrer"`

3. **Meta description (line 9):**
   - Replace "Vine Scout" with "VScout" in the description string.

#### [MODIFY] [landing/src/worker.js](file:///e:/TechTrekGT/landing/src/worker.js)

Add VScout dev port to `ALLOWED_ORIGINS`:
```js
// After line 36 (http://localhost:8787 entry):
'http://localhost:5175',  // vinescout dev
```

---

### Track 5: Architecture Documentation

#### [MODIFY] [e:/TechTrekGT/ARCHITECTURE.md](file:///e:/TechTrekGT/ARCHITECTURE.md)

- Section 1 project table: add `vinescout/` row (`techtrekgt.com/vinescout/*`, `React 19 + Vite + Cloudflare Workers`)
- Section 8.2 schema ownership: add `vinescout/vinescout-schema.sql` row
- Section 9.1 routes: add `techtrek-vinescout` entry
- Section 13 CORS origins: document `localhost:5175`
- Section 14.2 dev ports: add VScout row

#### [NEW] `e:/Vine/VineScout/docs/ARCHITECTURE.md`

New document covering:
- Extension architecture overview (background.js, content.js, inject_history.js, support.js)
- Storage rules (readVineItems/writeVineItems, session vs local)
- Cloud bridge design (cloudSync.js) and data contract
- Manifest permissions added for TechTrekGT integration
- externally_connectable configuration and security rationale

---

## Dependency Order

```
Track 2 (D1 Schema)
  |
  +-> Track 3 (Worker + Web App) ---+
                                    |
Track 1 (Extension Bridge) ---------+-> Track 4 (Landing Hub)
                                                |
                                        Track 5 (Docs)
```

Tracks 1 and 2 are independent and can start immediately upon plan approval.
Track 3 depends on Track 2.
Track 4 depends on Track 3 being deployed.
Track 5 can proceed in parallel with any track.

---

## Verification Plan

### Build Verification
```powershell
cd e:/TechTrekGT/vinescout
npm install
npm run build
# Expected: dist/client/ created, no errors

npm run db:migrate:local
# Expected: 4 tables created

wrangler dev
# GET /api/health -> { status: 'ok', worker: 'techtrek-vinescout' }
```

### Manual Verification
1. Landing page: "VScout" card routes to `/vinescout`, no external-badge.
2. Auth flow: login with SSO creds, `/api/auth/me` returns user object.
3. Extension push: trigger cloud push, verify 200 from `/api/vinescout/sync`.
4. Items view: pushed items appear in paginated table.
5. Tax view: GET/PUT `/api/vinescout/tax` round-trips correctly.
6. Production deploy: `npm run deploy` succeeds, Cloudflare shows `techtrek-vinescout`.

---

## File Change Summary

| Action | File | Track |
|--------|------|-------|
| MODIFY | `e:/Vine/VineScout/manifest.json` | 1 |
| NEW | `e:/Vine/VineScout/src/services/cloudSync.js` | 1 |
| MODIFY | `e:/Vine/VineScout/src/background.js` | 1 |
| MODIFY | `e:/Vine/VineScout/src/ui/dashboard.html` | 1 (Q3-b only) |
| NEW | `e:/TechTrekGT/vinescout/vinescout-schema.sql` | 2 |
| NEW | `e:/TechTrekGT/vinescout/` (entire project) | 3 |
| MODIFY | `e:/TechTrekGT/landing/index.html` | 4 |
| MODIFY | `e:/TechTrekGT/landing/src/worker.js` | 4 |
| MODIFY | `e:/TechTrekGT/ARCHITECTURE.md` | 5 |
| NEW | `e:/Vine/VineScout/docs/ARCHITECTURE.md` | 5 |
