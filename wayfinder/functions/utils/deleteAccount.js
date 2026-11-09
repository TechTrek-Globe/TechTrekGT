// Universal Account Deletion Helper for TechTrekGT Wayfinder
// Thoroughly cleans up all user references, invitations, tokens, documents, and shares across SQLite tables.

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

  // 2. Prepare atomic batch statements
  const stmts = [
    // Clear agenda shares where user is a participant
    db.prepare('DELETE FROM wayfinder_agenda_shares WHERE user_id = ?').bind(targetUserId),

    // Clear invites addressed to or sent by or accepted by user
    db.prepare(`
      DELETE FROM wayfinder_agenda_invites
      WHERE (invited_email = ? COLLATE NOCASE) OR (accepted_by = ?) OR (invited_by = ?)
    `).bind(email, targetUserId, targetUserId),

    // Clear verification codes and password reset requests
    db.prepare('DELETE FROM email_verifications WHERE user_id = ? OR email = ? COLLATE NOCASE').bind(targetUserId, email),
    db.prepare('DELETE FROM password_resets WHERE user_id = ? OR email = ? COLLATE NOCASE').bind(targetUserId, email),

    // Clear calendar subscription tokens
    db.prepare('DELETE FROM wayfinder_calendar_tokens WHERE user_id = ?').bind(targetUserId),

    // Clear packing items
    db.prepare('DELETE FROM wayfinder_packing_items WHERE user_id = ?').bind(targetUserId),

    // Clear expense splits and debt settlements
    db.prepare('DELETE FROM wayfinder_expense_splits WHERE user_id = ?').bind(targetUserId),
    db.prepare('DELETE FROM wayfinder_expense_settlements WHERE from_user_id = ? OR to_user_id = ?').bind(targetUserId, targetUserId),

    // Clear email inboxes and Gmail connections
    db.prepare('DELETE FROM wayfinder_email_inboxes WHERE user_id = ?').bind(targetUserId),
    db.prepare('DELETE FROM wayfinder_gmail_connections WHERE user_id = ?').bind(targetUserId),

    // Clear documents, extracted fields, extraction jobs, and personal expenses
    db.prepare('DELETE FROM wayfinder_extracted_fields WHERE document_id IN (SELECT id FROM wayfinder_documents WHERE user_id = ?)').bind(targetUserId),
    db.prepare('DELETE FROM wayfinder_extraction_jobs WHERE user_id = ? OR document_id IN (SELECT id FROM wayfinder_documents WHERE user_id = ?)').bind(targetUserId, targetUserId),
    db.prepare('DELETE FROM wayfinder_documents WHERE user_id = ?').bind(targetUserId),
    db.prepare('DELETE FROM wayfinder_expenses WHERE user_id = ?').bind(targetUserId),

    // Clear private itinerary items
    db.prepare("DELETE FROM wayfinder_itinerary_items WHERE user_id = ? AND visibility = 'private'").bind(targetUserId),

    // Reassign any journeys created by this user to 'system' so public itineraries persist
    db.prepare("UPDATE wayfinder_journeys SET created_by = 'system' WHERE created_by = ?").bind(targetUserId),

    // Log deletion event in audit log
    db.prepare(`
      INSERT INTO wayfinder_audit_events (id, user_id, journey_id, entity_type, entity_id, action, target_user_id, target_email, metadata_summary, details)
      VALUES (?, ?, 'system', 'user', ?, 'account_deleted', ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      actorUserId || 'system',
      targetUserId,
      targetUserId,
      email,
      `deletedUserId=${targetUserId}; deletedEmail=${email}; isSelf=${isSelf}`,
      JSON.stringify({ deletedUserId: targetUserId, deletedEmail: email, isSelf })
    ),

    // Finally, delete user record from users table
    db.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId)
  ];

  await db.batch(stmts);

  return {
    ok: true,
    userId: targetUserId,
    email: targetUser.email,
    name: targetUser.name,
    isSelf
  };
}

