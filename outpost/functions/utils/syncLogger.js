/**
 * syncLogger.js - Sync history logging and sync settings persistence for Outpost.
 *
 * Provides atomic tracking of platform sync runs (eBay, VineScout, Amazon, Webhooks).
 * Records failure states, error messages, and partial-sync item breakdowns to
 * outpost_sync_history and keeps outpost_sync_settings synchronized so the UI
 * can accurately inform the user of sync status.
 */

/**
 * Ensures the outpost_sync_history table and outpost_sync_settings columns exist.
 *
 * @param {object} db - Cloudflare D1 database binding
 */
export async function ensureSyncHistoryTable(db) {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS outpost_sync_history (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        sync_type       TEXT NOT NULL,
        status          TEXT NOT NULL,
        items_total     INTEGER NOT NULL DEFAULT 0,
        items_synced    INTEGER NOT NULL DEFAULT 0,
        items_failed    INTEGER NOT NULL DEFAULT 0,
        error_message   TEXT,
        details         TEXT,
        started_at      TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at    TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_sync_history_user ON outpost_sync_history(user_id, started_at DESC)'
    ).run();
  } catch (_) {}

  // Safely ensure status and error columns exist in outpost_sync_settings
  try { await db.prepare('ALTER TABLE outpost_sync_settings ADD COLUMN last_ebay_sync_status TEXT').run(); } catch (_) {}
  try { await db.prepare('ALTER TABLE outpost_sync_settings ADD COLUMN last_ebay_sync_error TEXT').run(); } catch (_) {}
  try { await db.prepare('ALTER TABLE outpost_sync_settings ADD COLUMN last_vscout_sync_status TEXT').run(); } catch (_) {}
  try { await db.prepare('ALTER TABLE outpost_sync_settings ADD COLUMN last_vscout_sync_error TEXT').run(); } catch (_) {}
}

/**
 * Records a sync run result in outpost_sync_history and updates outpost_sync_settings.
 *
 * @param {object} env - Cloudflare Worker environment with DB binding
 * @param {string} userId - Authenticated user ID
 * @param {object} params
 * @param {string} [params.syncType='ebay'] - 'ebay' | 'vscout' | 'webhook' | 'amazon'
 * @param {string} [params.status='success'] - 'success' | 'partial' | 'failed'
 * @param {number} [params.itemsTotal=0] - Total items targeted for sync
 * @param {number} [params.itemsSynced=0] - Number of items successfully synced
 * @param {number} [params.itemsFailed=0] - Number of items that failed
 * @param {string|null} [params.errorMessage=null] - Top-level error description
 * @param {object|array|null} [params.details=null] - Item-level failure breakdowns
 * @param {string} [params.startedAt] - ISO timestamp when sync run began
 * @returns {Promise<{ runId: string }>}
 */
export async function recordSyncRun(env, userId, {
  syncType = 'ebay',
  status = 'success',
  itemsTotal = 0,
  itemsSynced = 0,
  itemsFailed = 0,
  errorMessage = null,
  details = null,
  startedAt = new Date().toISOString()
}) {
  if (!env || !env.DB || !userId) return { runId: null };

  const runId = `sync_${crypto.randomUUID()}`;
  const completedAt = new Date().toISOString();
  const detailsJson = details ? JSON.stringify(details).slice(0, 10000) : null;
  const cleanErrMsg = errorMessage ? String(errorMessage).slice(0, 1000) : null;

  // 1. Log run to outpost_sync_history
  try {
    await ensureSyncHistoryTable(env.DB);
    await env.DB.prepare(`
      INSERT INTO outpost_sync_history
        (id, user_id, sync_type, status, items_total, items_synced, items_failed, error_message, details, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      runId,
      userId,
      syncType,
      status,
      itemsTotal,
      itemsSynced,
      itemsFailed,
      cleanErrMsg,
      detailsJson,
      startedAt,
      completedAt
    ).run();
  } catch (err) {
    console.error('[syncLogger] Failed to write to outpost_sync_history:', err);
  }

  // 2. Update outpost_sync_settings
  try {
    const isEbay = syncType === 'ebay';
    const isVscout = syncType === 'vscout';

    if (isEbay) {
      if (status === 'success') {
        // ACTUAL SUCCESS: stamp last_ebay_sync_at, status='success', clear error
        await env.DB.prepare(`
          INSERT INTO outpost_sync_settings
            (user_id, ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_ebay_sync_at, last_ebay_sync_status, last_ebay_sync_error, updated_at)
          VALUES (
            ?,
            COALESCE((SELECT ebay_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT ebay_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 30),
            COALESCE((SELECT vscout_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT vscout_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 60),
            datetime('now'),
            'success',
            NULL,
            datetime('now')
          )
          ON CONFLICT(user_id) DO UPDATE SET
            last_ebay_sync_at = datetime('now'),
            last_ebay_sync_status = 'success',
            last_ebay_sync_error = NULL,
            updated_at = datetime('now')
        `).bind(userId, userId, userId, userId, userId).run();
      } else if (status === 'partial') {
        // PARTIAL: preserve existing last_ebay_sync_at, document status='partial' and error
        await env.DB.prepare(`
          INSERT INTO outpost_sync_settings
            (user_id, ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_ebay_sync_status, last_ebay_sync_error, updated_at)
          VALUES (
            ?,
            COALESCE((SELECT ebay_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT ebay_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 30),
            COALESCE((SELECT vscout_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT vscout_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 60),
            'partial',
            ?,
            datetime('now')
          )
          ON CONFLICT(user_id) DO UPDATE SET
            last_ebay_sync_status = 'partial',
            last_ebay_sync_error = ?,
            updated_at = datetime('now')
        `).bind(userId, userId, userId, userId, userId, cleanErrMsg, cleanErrMsg).run();
      } else {
        // FAILED: NEVER stamp last_ebay_sync_at! Document failure and error message.
        await env.DB.prepare(`
          INSERT INTO outpost_sync_settings
            (user_id, ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_ebay_sync_status, last_ebay_sync_error, updated_at)
          VALUES (
            ?,
            COALESCE((SELECT ebay_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT ebay_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 30),
            COALESCE((SELECT vscout_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT vscout_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 60),
            'failed',
            ?,
            datetime('now')
          )
          ON CONFLICT(user_id) DO UPDATE SET
            last_ebay_sync_status = 'failed',
            last_ebay_sync_error = ?,
            updated_at = datetime('now')
        `).bind(userId, userId, userId, userId, userId, cleanErrMsg, cleanErrMsg).run();
      }
    } else if (isVscout) {
      if (status === 'success') {
        await env.DB.prepare(`
          INSERT INTO outpost_sync_settings
            (user_id, ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_vscout_sync_at, last_vscout_sync_status, last_vscout_sync_error, updated_at)
          VALUES (
            ?,
            COALESCE((SELECT ebay_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT ebay_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 30),
            COALESCE((SELECT vscout_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT vscout_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 60),
            datetime('now'),
            'success',
            NULL,
            datetime('now')
          )
          ON CONFLICT(user_id) DO UPDATE SET
            last_vscout_sync_at = datetime('now'),
            last_vscout_sync_status = 'success',
            last_vscout_sync_error = NULL,
            updated_at = datetime('now')
        `).bind(userId, userId, userId, userId, userId).run();
      } else {
        await env.DB.prepare(`
          INSERT INTO outpost_sync_settings
            (user_id, ebay_auto_sync, ebay_sync_interval_m, vscout_auto_sync, vscout_sync_interval_m, last_vscout_sync_status, last_vscout_sync_error, updated_at)
          VALUES (
            ?,
            COALESCE((SELECT ebay_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT ebay_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 30),
            COALESCE((SELECT vscout_auto_sync FROM outpost_sync_settings WHERE user_id = ?), 0),
            COALESCE((SELECT vscout_sync_interval_m FROM outpost_sync_settings WHERE user_id = ?), 60),
            ?,
            ?,
            datetime('now')
          )
          ON CONFLICT(user_id) DO UPDATE SET
            last_vscout_sync_status = ?,
            last_vscout_sync_error = ?,
            updated_at = datetime('now')
        `).bind(userId, userId, userId, userId, userId, status, cleanErrMsg, status, cleanErrMsg).run();
      }
    }
  } catch (err) {
    console.error('[syncLogger] Failed to update outpost_sync_settings:', err);
  }

  return { runId };
}
