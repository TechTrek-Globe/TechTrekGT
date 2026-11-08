// Universal Account Deletion Helper for TechTrekGT Finance OS
// Thoroughly cleans up user records, backups, shares, invites, and sessions across SQLite tables.

export async function deleteUserAccount(db, targetUserId, actorUserId) {
  if (!targetUserId || typeof targetUserId !== 'string') {
    return { ok: false, error: 'Target user ID is required', status: 400 };
  }

  // 1. Fetch target user to ensure existence and capture email & role
  const targetUser = await db.prepare(
    'SELECT id, email, name, role, is_admin FROM users WHERE id = ?'
  ).bind(targetUserId).first();

  if (!targetUser) {
    return { ok: false, error: 'User account not found', status: 404 };
  }

  const email = targetUser.email;
  const isSelf = targetUserId === actorUserId;

  // 2. Discover available tables in database
  let existingTables = new Set();
  try {
    const tableRows = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all();
    for (const r of tableRows.results || []) {
      existingTables.add(r.name);
    }
  } catch (err) {
    console.warn('[deleteAccount] sqlite_master check warning:', err && err.message);
  }

  const batchStmts = [];

  // Helper to add statement if table exists or as default core
  const addIfTable = (tableName, sql, ...params) => {
    if (existingTables.size === 0 || existingTables.has(tableName)) {
      batchStmts.push(db.prepare(sql).bind(...params));
    }
  };

  // --- Core Finance Tables ---
  addIfTable('ledger_shares', 'DELETE FROM ledger_shares WHERE user_id = ?', targetUserId);
  addIfTable(
    'ledger_invites',
    'DELETE FROM ledger_invites WHERE (invited_email = ? COLLATE NOCASE) OR (accepted_by = ?) OR (invited_by = ?)',
    email, targetUserId, targetUserId
  );
  addIfTable('user_backups', 'DELETE FROM user_backups WHERE id = ?', targetUserId);
  addIfTable('user_backup_versions', 'DELETE FROM user_backup_versions WHERE user_id = ?', targetUserId);
  addIfTable('finance_ledgers', 'DELETE FROM finance_ledgers WHERE owner_id = ?', targetUserId);

  // --- Shared Auth & Verification Tables ---
  addIfTable('email_verifications', 'DELETE FROM email_verifications WHERE user_id = ? OR email = ? COLLATE NOCASE', targetUserId, email);
  addIfTable('password_resets', 'DELETE FROM password_resets WHERE user_id = ? OR email = ? COLLATE NOCASE', targetUserId, email);

  // --- Optional Cross-App Domain Tables (Wayfinder & Outpost) ---
  addIfTable('wayfinder_agenda_shares', 'DELETE FROM wayfinder_agenda_shares WHERE user_id = ?', targetUserId);
  addIfTable(
    'wayfinder_agenda_invites',
    'DELETE FROM wayfinder_agenda_invites WHERE (invited_email = ? COLLATE NOCASE) OR (accepted_by = ?) OR (invited_by = ?)',
    email, targetUserId, targetUserId
  );
  addIfTable('wayfinder_audit_events', 'DELETE FROM wayfinder_audit_events WHERE user_id = ?', targetUserId);
  addIfTable('wayfinder_calendar_tokens', 'DELETE FROM wayfinder_calendar_tokens WHERE user_id = ?', targetUserId);
  addIfTable('wayfinder_packing_items', 'DELETE FROM wayfinder_packing_items WHERE user_id = ?', targetUserId);
  addIfTable('wayfinder_expense_splits', 'DELETE FROM wayfinder_expense_splits WHERE user_id = ?', targetUserId);
  addIfTable('wayfinder_expense_settlements', 'DELETE FROM wayfinder_expense_settlements WHERE from_user_id = ? OR to_user_id = ?', targetUserId, targetUserId);
  addIfTable('wayfinder_email_inboxes', 'DELETE FROM wayfinder_email_inboxes WHERE user_id = ?', targetUserId);
  addIfTable('wayfinder_gmail_connections', 'DELETE FROM wayfinder_gmail_connections WHERE user_id = ?', targetUserId);
  addIfTable('wayfinder_documents', 'DELETE FROM wayfinder_documents WHERE user_id = ?', targetUserId);
  addIfTable('wayfinder_expenses', 'DELETE FROM wayfinder_expenses WHERE user_id = ?', targetUserId);
  addIfTable('wayfinder_itinerary_items', "DELETE FROM wayfinder_itinerary_items WHERE user_id = ? AND visibility = 'private'", targetUserId);
  addIfTable('wayfinder_journeys', "UPDATE wayfinder_journeys SET created_by = 'system' WHERE created_by = ?", targetUserId);

  addIfTable('auction_platforms', 'DELETE FROM auction_platforms WHERE user_id = ?', targetUserId);
  addIfTable('auction_items', 'DELETE FROM auction_items WHERE user_id = ?', targetUserId);

  // --- Primary Users Record ---
  batchStmts.push(db.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId));

  try {
    await db.batch(batchStmts);
    return {
      ok: true,
      userId: targetUserId,
      email: targetUser.email,
      name: targetUser.name,
      isSelf
    };
  } catch (batchErr) {
    console.error('[deleteAccount] batch error:', batchErr && batchErr.message);
    return {
      ok: false,
      error: 'Failed to delete user account: database operation rejected',
      status: 500
    };
  }
}

