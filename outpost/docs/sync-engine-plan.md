# Outpost Bi-Directional Sync Engine - Implementation Plan (Phase 7)

## Overview

This plan adds a bi-directional, automated synchronization engine to Outpost Tracker:

1. **eBay Sales Sync** - Manual on-demand button + configurable auto-polling, leveraging the existing `sync-all.js` / `tokenHelper.js` Fulfillment API pipeline.
2. **VScout Inventory Sync** - Manual + auto ingestion of Amazon Vine records into Outpost inventory, plus outbound sale write-back to VScout-sourced items.

The existing Phase 3/6 infrastructure (`sync-all.js`, `tokenHelper.js`, `vinescout-catalog.js`, `reconcileAndSaveEbaySale`) is fully operational. All changes are **additive** - no restructuring, no moved code.

---

## User Review Required

> [!IMPORTANT]
> **VineScout Integration Method - Choice Required**
>
> VineScout is a Chromium MV3 Extension storing data in `chrome.storage.local`. It is NOT a server. Three options:
>
> - **Option A (Recommended - D1 Shared Table):** VineScout already pushes to Outpost via `POST /api/import/amazon` Bearer-token endpoint. Outpost reads back from `auction_items.attributes` (contains ASIN, ETV, order_id). `GET /api/sync/vinescout-catalog` already returns these items. Zero new infrastructure needed.
> - **Option B - Local REST Bridge:** Outpost browser JS calls `https://localhost:5000/api/sync` (optional VineScout local server). Works only when that server is running.
> - **Option C - Chrome Extension Message Bridge:** Requires adding `externally_connectable` to VineScout's `manifest.json` - a separate VineScout release.
>
> **This plan implements Option A.** Confirm, or specify your preference.

> [!IMPORTANT]
> **eBay Auto-Sync Polling Method**
>
> Cloudflare Workers have no persistent scheduler without a paid Cron Trigger. This plan implements **client-side `setInterval`** (runs while tab is open, matches existing app pattern). A Cloudflare Cron Trigger stub will be noted for future activation.

> [!WARNING]
> **Production Schema Migration Required**
>
> A new `outpost_sync_settings` table requires `npm run db:migrate` on production after deploy. The migration is `CREATE TABLE IF NOT EXISTS` only - fully additive, zero risk.

---

## Open Questions

1. **VScout write-back depth:** Plan updates `auction_items.attributes` blob with `{ outpost_liquidated, sale_price, sold_at, ebay_order_id }`. Should it also best-effort POST to VineScout local server (`https://localhost:5000/api/sync`) if reachable?
2. **Auto-sync default intervals:** 30 min eBay, 60 min VScout - acceptable defaults?
3. **Button placements:** "Sync eBay Sales" in both `InventoryCommandBar` AND `SalesLogView` header - confirm both?

---

## Proposed Changes

---

### P7-A: D1 Schema Migration

#### [MODIFY] [auction-schema.sql](file:///e:/TechTrekGT/outpost/auction-schema.sql)

Append at end of file:

```sql
-- ============================================================
-- PHASE 7 MIGRATIONS - Bi-Directional Sync Engine
-- Added: 2026-09-02
-- Additive only. No DROP or ALTER.
-- Run: npm run db:migrate:local | npm run db:migrate
-- ============================================================

-- P7-1: Per-user sync automation preferences
CREATE TABLE IF NOT EXISTS outpost_sync_settings (
  user_id                TEXT PRIMARY KEY,
  ebay_auto_sync         INTEGER NOT NULL DEFAULT 0,
  ebay_sync_interval_m   INTEGER NOT NULL DEFAULT 30,
  vscout_auto_sync       INTEGER NOT NULL DEFAULT 0,
  vscout_sync_interval_m INTEGER NOT NULL DEFAULT 60,
  last_ebay_sync_at      TEXT,
  last_vscout_sync_at    TEXT,
  updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

### P7-B: Backend - Sync Settings API

#### [NEW] functions/api/sync/settings.js

```
GET  /api/sync/settings  -> { settings: { ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_ebay_sync_at, last_vscout_sync_at } }
PUT  /api/sync/settings  -> partial body accepted; upserts row; returns updated settings object
```

Pattern: mirrors `functions/api/sync/finance.js` exactly.
- `requireAuth` + `withAuth` from `../../utils/guard.js`.
- GET: `SELECT * FROM outpost_sync_settings WHERE user_id = ?`; returns defaults if no row exists.
- PUT: `INSERT OR REPLACE INTO outpost_sync_settings (...)` with coerced integer values + `updated_at = datetime('now')`.

---

### P7-C: Backend - VScout Sale Write-Back

#### [MODIFY] [functions/api/sync/vinescout-catalog.js](file:///e:/TechTrekGT/outpost/functions/api/sync/vinescout-catalog.js)

Add `onRequestPost` (currently only `onRequestGet` exists):

```
POST /api/sync/vinescout-catalog
Body: { item_id, sale_price, sale_date, ebay_order_id }
```

Logic:
1. `requireAuth` -> `userId`.
2. `SELECT id, attributes FROM auction_items WHERE id = ? AND user_id = ?`.
3. Verify row exists and `attributes` contains `asin` or `order_id` (VScout-sourced check).
4. Parse JSON, merge: `{ outpost_liquidated: 1, sale_price, sold_at: sale_date, ebay_order_id }`.
5. `UPDATE auction_items SET attributes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`.
6. Return `ok({ success: true, item_id })`.

---

### P7-D: Backend - `sync-all.js` Targeted Additions

#### [MODIFY] [functions/api/ebay/sync-all.js](file:///e:/TechTrekGT/outpost/functions/api/ebay/sync-all.js)

**Addition 1:** VScout write-back inside the `if (isSold)` block, after `reconcileAndSaveEbaySale` call at ~line 148:

```js
// P7: VScout write-back - stamp sold metadata on Vine-sourced items
try {
  let attrs = {};
  if (item.attributes) {
    attrs = typeof item.attributes === 'string' ? JSON.parse(item.attributes) : item.attributes;
  }
  if (attrs.asin || attrs.order_id) {
    attrs.outpost_liquidated = 1;
    if (orderData?.salePrice != null) attrs.sale_price = orderData.salePrice;
    attrs.sold_at = orderData?.createdDate || new Date().toISOString();
    if (orderData?.orderId) attrs.ebay_order_id = orderData.orderId;
    await env.DB.prepare(
      `UPDATE auction_items SET attributes = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
    ).bind(JSON.stringify(attrs), item.id, payload.userId).run();
  }
} catch (wbErr) {
  console.warn('[sync-all] VScout write-back exception:', wbErr);
}
```

**Addition 2:** Stamp `last_ebay_sync_at` after existing `last_refreshed_at` stamp at ~line 160:

```js
// P7: Stamp last_ebay_sync_at in outpost_sync_settings (upsert safe - COALESCE preserves existing prefs)
await env.DB.prepare(`
  INSERT OR REPLACE INTO outpost_sync_settings
    (user_id, ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_ebay_sync_at, updated_at)
  VALUES (?,
    COALESCE((SELECT ebay_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
    COALESCE((SELECT ebay_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 30),
    COALESCE((SELECT vscout_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
    COALESCE((SELECT vscout_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 60),
    datetime('now'), datetime('now'))
`).bind(payload.userId, payload.userId, payload.userId, payload.userId, payload.userId).run().catch(() => {});
```

---

### P7-E: Backend - Worker Route Registration

#### [MODIFY] [src/worker.js](file:///e:/TechTrekGT/outpost/src/worker.js)

**Imports** (after line 40):
```js
import { onRequestGet as syncSettingsGetHandler, onRequestPut as syncSettingsPutHandler } from '../functions/api/sync/settings.js';
import { onRequestPost as vinescoutCatalogPostHandler } from '../functions/api/sync/vinescout-catalog.js';
```

**Routes** (after existing `vinescoutCatalogHandler` GET route at line 272):
```js
} else if (apiPath === '/api/sync/settings' && request.method === 'GET') {
  response = await syncSettingsGetHandler(context);
} else if (apiPath === '/api/sync/settings' && request.method === 'PUT') {
  response = await syncSettingsPutHandler(context);
} else if (apiPath === '/api/sync/vinescout-catalog' && request.method === 'POST') {
  response = await vinescoutCatalogPostHandler(context);
```

---

### P7-F: Frontend - `auctionApi.js` API Helpers

#### [MODIFY] [src/utils/auctionApi.js](file:///e:/TechTrekGT/outpost/src/utils/auctionApi.js)

Append after line 319 (`getVineScoutCatalog`):

```js
// --- Sync Engine Settings ---
export const getSyncSettings = () =>
  apiFetch('/api/sync/settings');

export const updateSyncSettings = (body) =>
  apiFetch('/api/sync/settings', {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  });

// --- VScout Sale Write-Back ---
export const writeBackVScoutSale = (itemId, saleData) =>
  apiFetch('/api/sync/vinescout-catalog', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ item_id: itemId, ...saleData })
  });
```

---

### P7-G: Frontend - `InventoryCommandBar.jsx` Sync Button

#### [MODIFY] [src/components/inventory/InventoryCommandBar.jsx](file:///e:/TechTrekGT/outpost/src/components/inventory/InventoryCommandBar.jsx)

**Props added** to function signature after `overallMargin`:
```js
onSyncEbay,
syncing = false,
```

**Button** inserted in right-side action group, before the existing `+ Invoice` button (~line 220):
```jsx
<button
  id="sync-ebay-sales-btn"
  onClick={onSyncEbay}
  disabled={syncing || loading}
  className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 flex items-center gap-1 transition-all disabled:opacity-50"
  title="Pull latest eBay sales and reconcile inventory"
>
  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
  <span className="hidden sm:inline">Sync eBay</span>
</button>
```

---

### P7-H: Frontend - `InventoryHubView.jsx` Sync Handler + Toast

#### [MODIFY] [src/components/InventoryHubView.jsx](file:///e:/TechTrekGT/outpost/src/components/InventoryHubView.jsx)

**Import:** Add `syncAllEbayItems` to existing `auctionApi` import line.

**State** (after line 63):
```js
const [syncing, setSyncing] = useState(false);
const [syncResult, setSyncResult] = useState(null);
```

**Handler** (after `handleMarkSold`):
```js
const handleSyncEbay = async () => {
  setSyncing(true);
  setSyncResult(null);
  try {
    const res = await syncAllEbayItems();
    setSyncResult({ ok: true, msg: res.message || 'eBay sync complete.' });
    refreshAll();
  } catch (e) {
    setSyncResult({ ok: false, msg: e.message });
  } finally {
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 5000);
  }
};
```

**Toast banner** (after `<InventoryCommandBar ... />` closing tag, before `{showMetrics && ...}`):
```jsx
{syncResult && (
  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs border flex-shrink-0 ${
    syncResult.ok
      ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
      : 'bg-red-950/40 border-red-500/30 text-red-400'
  }`}>
    {syncResult.ok
      ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400" />
      : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />}
    <span>{syncResult.msg}</span>
  </div>
)}
```

Add `CheckCircle2` to the lucide-react import (line 2).

**`<InventoryCommandBar>` JSX:** Add `onSyncEbay={handleSyncEbay}` and `syncing={syncing}` props.

---

### P7-I: Frontend - `SettingsView.jsx` Integrations Tab Additions

#### [MODIFY] [src/components/SettingsView.jsx](file:///e:/TechTrekGT/outpost/src/components/SettingsView.jsx)

**Import additions:** `getSyncSettings`, `updateSyncSettings`, `syncAllEbayItems`, `getVineScoutCatalog` from `../utils/auctionApi`.

**State** (after `skuActionLoading`, ~line 76):
```js
const [syncSettings, setSyncSettings] = useState(null);
const [syncSettingsLoading, setSyncSettingsLoading] = useState(false);
const [ebaySyncing, setEbaySyncing] = useState(false);
const [vscoutSyncing, setVscoutSyncing] = useState(false);
```

**`useEffect` extension** (inside existing integrations effect at ~line 79, after the `amazonToken` check):
```js
if (activeTab === 'integrations' && syncSettings === null && !syncSettingsLoading) {
  setSyncSettingsLoading(true);
  getSyncSettings()
    .then(d => setSyncSettings(d.settings || d))
    .catch(() => {})
    .finally(() => setSyncSettingsLoading(false));
}
```

**Auto-polling `useEffect`** (new, added after existing effect blocks):
```js
useEffect(() => {
  if (!syncSettings?.ebay_auto_sync && !syncSettings?.vscout_auto_sync) return;
  const intervals = [];
  if (syncSettings.ebay_auto_sync) {
    const ms = (syncSettings.ebay_sync_interval_m || 30) * 60 * 1000;
    intervals.push(setInterval(handleManualEbaySync, ms));
  }
  if (syncSettings.vscout_auto_sync) {
    const ms = (syncSettings.vscout_sync_interval_m || 60) * 60 * 1000;
    intervals.push(setInterval(handleManualVScoutSync, ms));
  }
  return () => intervals.forEach(clearInterval);
}, [syncSettings?.ebay_auto_sync, syncSettings?.ebay_sync_interval_m,
    syncSettings?.vscout_auto_sync, syncSettings?.vscout_sync_interval_m]);
```

**Handlers** (after `handlePushAllSkusToEbay`):
```js
const handleToggleSyncSetting = async (field) => {
  const newVal = syncSettings?.[field] ? 0 : 1;
  setSyncSettings(prev => ({ ...prev, [field]: newVal }));
  try {
    const res = await updateSyncSettings({ [field]: newVal });
    setSyncSettings(res.settings || res);
    showSuccess(`${field === 'ebay_auto_sync' ? 'eBay' : 'VScout'} auto-sync ${newVal ? 'enabled' : 'disabled'}.`);
  } catch (e) {
    setSyncSettings(prev => ({ ...prev, [field]: newVal ? 0 : 1 })); // rollback
    setError(e.message);
  }
};

const handleSyncIntervalChange = async (field, val) => {
  setSyncSettings(prev => ({ ...prev, [field]: val }));
  try { await updateSyncSettings({ [field]: val }); } catch (e) { setError(e.message); }
};

const handleManualEbaySync = async () => {
  setEbaySyncing(true);
  try {
    const res = await syncAllEbayItems();
    showSuccess(res.message || 'eBay sales sync complete.');
    getSyncSettings().then(d => setSyncSettings(d.settings || d));
  } catch (e) {
    setError(`eBay sync failed: ${e.message}`);
  } finally { setEbaySyncing(false); }
};

const handleManualVScoutSync = async () => {
  setVscoutSyncing(true);
  try {
    const res = await getVineScoutCatalog();
    showSuccess(`VScout sync complete. ${res.items?.length ?? 0} items in catalog.`);
    getSyncSettings().then(d => setSyncSettings(d.settings || d));
  } catch (e) {
    setError(`VScout sync failed: ${e.message}`);
  } finally { setVscoutSyncing(false); }
};
```

**UI: eBay Auto-Sync sub-card** inserted inside the existing eBay Integration glass-card, after the SKU push grid (~line 757):

```jsx
{/* P7 - eBay Sales Auto-Sync */}
<div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
  <div className="flex items-center justify-between gap-3">
    <div>
      <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
        <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
        eBay Sales Auto-Sync
      </div>
      <p className="text-[11px] text-slate-400 mt-0.5">Automatically reconcile completed orders on a schedule while this tab is open.</p>
    </div>
    <button
      id="ebay-auto-sync-toggle"
      type="button"
      onClick={() => handleToggleSyncSetting('ebay_auto_sync')}
      disabled={syncSettingsLoading}
      className={`relative inline-flex w-10 h-5 rounded-full transition-colors flex-shrink-0 ${syncSettings?.ebay_auto_sync ? 'bg-blue-500' : 'bg-slate-700'}`}
    >
      <span className={`inline-block w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${syncSettings?.ebay_auto_sync ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
  {syncSettings?.ebay_auto_sync ? (
    <div className="flex items-center gap-2 text-xs text-slate-300">
      <span>Poll every</span>
      <select
        value={syncSettings.ebay_sync_interval_m || 30}
        onChange={e => handleSyncIntervalChange('ebay_sync_interval_m', Number(e.target.value))}
        className="input-field py-0.5 px-2 text-xs w-20"
      >
        <option value={15}>15 min</option>
        <option value={30}>30 min</option>
        <option value={60}>1 hr</option>
        <option value={120}>2 hr</option>
      </select>
    </div>
  ) : null}
  <button
    id="ebay-sync-now-btn"
    type="button"
    onClick={handleManualEbaySync}
    disabled={ebaySyncing}
    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
  >
    <RefreshCw className={`w-3.5 h-3.5 ${ebaySyncing ? 'animate-spin' : ''}`} />
    Sync eBay Sales Now
  </button>
  {syncSettings?.last_ebay_sync_at && (
    <p className="text-[10px] text-slate-500">Last synced: {new Date(syncSettings.last_ebay_sync_at).toLocaleString()}</p>
  )}
</div>
```

**UI: VScout Sync glass-card** inserted after the existing VineScout token card (~line 790):

```jsx
{/* P7 - VScout Inventory Sync */}
<div className="glass-card rounded-2xl p-6 border border-purple-500/20 bg-purple-950/10 space-y-4">
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/60 pb-4">
    <div>
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-purple-400" />
        <h3 className="text-base font-bold text-white">VScout Inventory Sync</h3>
      </div>
      <p className="text-xs text-slate-400 mt-0.5">Pull Vine order records into Outpost and write sale results back to VScout.</p>
    </div>
    <button
      id="vscout-sync-now-btn"
      type="button"
      onClick={handleManualVScoutSync}
      disabled={vscoutSyncing}
      className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 flex items-center gap-2 flex-shrink-0 transition-all disabled:opacity-50"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${vscoutSyncing ? 'animate-spin' : ''}`} />
      Sync VScout
    </button>
  </div>
  <div className="flex items-center justify-between gap-3">
    <div>
      <div className="text-xs font-bold text-slate-200">Auto-Sync VScout</div>
      <p className="text-[11px] text-slate-400 mt-0.5">Automatically check for new Vine items pushed from the VScout extension.</p>
    </div>
    <button
      id="vscout-auto-sync-toggle"
      type="button"
      onClick={() => handleToggleSyncSetting('vscout_auto_sync')}
      disabled={syncSettingsLoading}
      className={`relative inline-flex w-10 h-5 rounded-full transition-colors flex-shrink-0 ${syncSettings?.vscout_auto_sync ? 'bg-purple-500' : 'bg-slate-700'}`}
    >
      <span className={`inline-block w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-0.5 ${syncSettings?.vscout_auto_sync ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
  {syncSettings?.vscout_auto_sync ? (
    <div className="flex items-center gap-2 text-xs text-slate-300">
      <span>Poll every</span>
      <select
        value={syncSettings.vscout_sync_interval_m || 60}
        onChange={e => handleSyncIntervalChange('vscout_sync_interval_m', Number(e.target.value))}
        className="input-field py-0.5 px-2 text-xs w-20"
      >
        <option value={15}>15 min</option>
        <option value={30}>30 min</option>
        <option value={60}>1 hr</option>
        <option value={120}>2 hr</option>
      </select>
    </div>
  ) : null}
  <p className="text-[10px] text-slate-500 bg-slate-900/60 rounded-lg p-2 border border-slate-800 leading-relaxed">
    VScout data is ingested via the Chrome Extension bearer-token endpoint. Push items from VScout first, then sync here to reflect them in Outpost inventory.
  </p>
  {syncSettings?.last_vscout_sync_at && (
    <p className="text-[10px] text-slate-500">Last synced: {new Date(syncSettings.last_vscout_sync_at).toLocaleString()}</p>
  )}
</div>
```

---

### P7-J: Frontend - `SalesLogView.jsx` Sync Button

#### [MODIFY] [src/components/SalesLogView.jsx](file:///e:/TechTrekGT/outpost/src/components/SalesLogView.jsx)

- Import `syncAllEbayItems` from `../utils/auctionApi`.
- Add `syncing`/`setSyncing` and `syncMsg`/`setSyncMsg` local state.
- Add `handleSyncEbay` handler (calls `syncAllEbayItems()`, then `fetchSales()`).
- Insert "Sync eBay Sales" button in existing header action row.
- Exact insertion line confirmed at execution time by reading the header JSX.

---

### P7-K: (Optional) Auto-Sync Promotion to `InventoryContext`

#### [MODIFY] [src/context/InventoryContext.jsx](file:///e:/TechTrekGT/outpost/src/context/InventoryContext.jsx)

If polling must persist when user navigates away from Settings:
- Load `syncSettings` once on context mount.
- Mount `setInterval` inside `InventoryContext` (wraps entire app tree).
- Expose `syncSettings`, `ebaySyncing`, `vscoutSyncing` via context value.
- `SettingsView` reads from context rather than managing its own intervals.

**Marked optional.** Default plan (in-SettingsView) is sufficient for manual use and scheduled polling while Settings is open.

---

## Files Summary

| File | Status | Change |
|------|--------|--------|
| `auction-schema.sql` | MODIFY | +12 lines: `outpost_sync_settings` table |
| `functions/api/sync/settings.js` | **NEW** | ~60 lines: GET + PUT handler |
| `functions/api/sync/vinescout-catalog.js` | MODIFY | +35 lines: `onRequestPost` write-back |
| `functions/api/ebay/sync-all.js` | MODIFY | +25 lines: VScout write-back + `last_ebay_sync_at` stamp |
| `src/worker.js` | MODIFY | +2 imports + 3 routes (~6 lines) |
| `src/utils/auctionApi.js` | MODIFY | +15 lines: 3 API helpers |
| `src/components/inventory/InventoryCommandBar.jsx` | MODIFY | +15 lines: 2 props + button |
| `src/components/InventoryHubView.jsx` | MODIFY | +30 lines: state + handler + toast |
| `src/components/SettingsView.jsx` | MODIFY | +130 lines: state + 2 cards + 4 handlers + effect |
| `src/components/SalesLogView.jsx` | MODIFY | +18 lines: sync button in header |
| `src/context/InventoryContext.jsx` | MODIFY (opt.) | +30 lines: promote polling |

---

## Reconciliation Flow (eBay Fulfillment) - Reference

Existing pipeline in `sync-all.js` + `tokenHelper.js`:
1. `fetchEbayActiveSellerListings()` - Trading API + Sell Inventory API dual strategy.
2. `fetchSingleEbayListing()` - promo rate enrichment (capped at 30).
3. For sold items: `fetchEbayOrderForListing()` -> `/sell/fulfillment/v1/order`.
4. `fetchEbayOrderFinances()` -> `/sell/finances/v1/transaction`.
5. `reconcileAndSaveEbaySale()` - atomic upsert into `auction_sales` + `ebay_fee_reconciliations`.

**P7 additions are strictly additive:**
- VScout write-back: D1 `attributes` blob UPDATE after step 5.
- `last_ebay_sync_at` UPSERT into `outpost_sync_settings`.
- Explicit `console.warn` when `ebay_order_id` deduplication skips a pre-existing sale record.

---

## Verification Plan

### Schema Migration
```powershell
cd e:/TechTrekGT/outpost
npm run db:migrate:local
npx wrangler d1 execute personal-budget-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='outpost_sync_settings';"
```

### API Endpoint Tests
```powershell
# GET without auth (should 401)
curl http://localhost:3001/outpost/api/sync/settings

# PUT with session cookie
curl -X PUT http://localhost:3001/outpost/api/sync/settings `
  -H "Content-Type: application/json" `
  -d '{"ebay_auto_sync":1,"ebay_sync_interval_m":30}' `
  --cookie "session=<token>"

# Confirm GET returns updated values
curl http://localhost:3001/outpost/api/sync/settings --cookie "session=<token>"
```

### UI Checklist
1. Inventory - "Sync eBay" button visible in `InventoryCommandBar`, disabled while syncing.
2. Click button - spinner, success toast, `refreshAll()` fires.
3. Settings > Integrations - eBay Auto-Sync toggle + interval selector renders.
4. Toggle ON - PUT fires, toggle turns blue.
5. VScout Sync card visible with auto-sync toggle + "Sync VScout" button.
6. "Sync VScout" - catalog count message displays.
7. Sales Log - "Sync eBay Sales" button in header functional.

### Build Gate
```powershell
cd e:/TechTrekGT/outpost
npm run build    # zero errors required
npm run deploy
```

---

## ARCHITECTURE.md Updates (Post-Execution)

Update Section 2.4 and 8.2 to reflect:
- `GET|PUT /api/sync/settings` - sync automation config endpoints.
- `POST /api/sync/vinescout-catalog` - VScout sale write-back endpoint.
- New `outpost_sync_settings` table in schema ownership table.
- Client-side `setInterval` auto-polling pattern in `SettingsView`.

---

*Plan authored: 2026-09-02*
