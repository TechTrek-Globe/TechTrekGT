#!/usr/bin/env node
/**
 * migrate-amazon-tokens.js - One-time migration script for [HIGH-4].
 *
 * Problem:
 * Plaintext storage of `amazon_api_token` bearer credentials in `users` table.
 *
 * Action:
 * 1. Ensures `amazon_api_token_hash` column exists on `users` table.
 * 2. Force-rotates all existing plaintext tokens:
 *    - Generates a new cryptographically secure 40-character hex token.
 *    - Hashes it using SHA-256 (64-character hex digest).
 *    - Updates `users.amazon_api_token_hash = hash` and clears `users.amazon_api_token = NULL`.
 *    - Outputs clear notification details so the affected integration user knows their new token.
 * 3. Verifies that the raw token is completely purged from the database and only the hash remains.
 *
 * Usage:
 *   node scripts/migrate-amazon-tokens.js [--remote] [--dry-run]
 */

import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const isRemote = args.includes('--remote');
const isDryRun = args.includes('--dry-run');

function runD1(sql) {
  const remoteFlag = isRemote ? '--remote' : '--local';
  const escapedSql = sql.replace(/"/g, '\\"');
  const cmd = `npx wrangler d1 execute personal-budget-db ${remoteFlag} --command="${escapedSql}"`;
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const match = stdout.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed[0]?.results || [];
    }
    return [];
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error('D1 execution failed:', stderr);
    process.exit(1);
  }
}

async function sha256Hex(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateToken() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function main() {
  console.log('===========================================================');
  console.log('HIGH-4: Amazon API Token Plaintext Storage Migration');
  console.log(`Target Database: ${isRemote ? 'Cloudflare D1 (Remote / Production)' : 'Cloudflare D1 (Local)'}`);
  console.log(`Dry Run Mode   : ${isDryRun ? 'YES (No writes)' : 'NO (Writes enabled)'}`);
  console.log('===========================================================\n');

  // Step 1: Ensure amazon_api_token_hash column exists
  console.log('Ensuring users.amazon_api_token_hash column exists...');
  const tableInfo = runD1('PRAGMA table_info(users);');
  const hasHashCol = tableInfo.some(col => col.name === 'amazon_api_token_hash');

  if (!hasHashCol) {
    if (isDryRun) {
      console.log('  [DRY RUN] Would execute: ALTER TABLE users ADD COLUMN amazon_api_token_hash TEXT;');
    } else {
      runD1('ALTER TABLE users ADD COLUMN amazon_api_token_hash TEXT;');
      console.log('  -> Added column users.amazon_api_token_hash successfully.\n');
    }
  } else {
    console.log('  -> Column users.amazon_api_token_hash already exists.\n');
  }

  // Step 2: Query existing users with plaintext amazon_api_token
  const selectQuery = hasHashCol
    ? 'SELECT id, email, amazon_api_token, amazon_api_token_hash FROM users WHERE amazon_api_token IS NOT NULL;'
    : 'SELECT id, email, amazon_api_token FROM users WHERE amazon_api_token IS NOT NULL;';
  const rows = runD1(selectQuery);
  if (!rows || rows.length === 0) {
    console.log('No rows with plaintext amazon_api_token found in users table.');
    console.log('All tokens are already hashed and protected. Migration complete.');
    return;
  }

  console.log(`Found ${rows.length} user(s) with plaintext amazon_api_token requiring force-rotation:\n`);

  let rotatedCount = 0;
  const notifications = [];

  for (const row of rows) {
    const { id, email, amazon_api_token } = row;
    console.log(`Processing user: ${email} (${id})...`);

    const newToken = generateToken();
    const tokenHash = await sha256Hex(newToken);

    if (isDryRun) {
      console.log(`  [DRY RUN] Would generate new token: ${newToken}`);
      console.log(`  [DRY RUN] Would store SHA-256 hash: ${tokenHash}`);
      console.log('  [DRY RUN] Would set amazon_api_token = NULL.');
    } else {
      runD1(`UPDATE users SET amazon_api_token_hash = '${tokenHash}', amazon_api_token = NULL WHERE id = '${id}';`);
      console.log('  -> Row updated: hash stored, plaintext purged.');

      // Verification: verify row in D1
      const verifyRows = runD1(`SELECT id, amazon_api_token, amazon_api_token_hash FROM users WHERE id = '${id}';`);
      if (verifyRows && verifyRows[0]) {
        const v = verifyRows[0];
        if (v.amazon_api_token !== null) {
          console.error(`  -> VERIFICATION FAILED: amazon_api_token is not NULL! (${v.amazon_api_token})`);
          process.exit(1);
        }
        if (v.amazon_api_token_hash !== tokenHash) {
          console.error('  -> VERIFICATION FAILED: amazon_api_token_hash does not match computed hash!');
          process.exit(1);
        }
        console.log('  -> VERIFICATION PASSED: Plaintext purged (NULL), SHA-256 hash verified.');
      }
    }

    notifications.push({
      id,
      email,
      oldTokenSnippet: amazon_api_token.slice(0, 8) + '...',
      newToken,
      tokenHash
    });

    rotatedCount++;
    console.log();
  }

  console.log('===========================================================');
  console.log('Migration Summary:');
  console.log(`  - Total Rows Processed : ${rows.length}`);
  console.log(`  - Successfully Rotated : ${rotatedCount}`);
  console.log('===========================================================\n');

  console.log('===========================================================');
  console.log('FORCE ROTATION NOTIFICATIONS:');
  console.log('===========================================================');
  for (const n of notifications) {
    console.log(`User Email : ${n.email}`);
    console.log(`User ID    : ${n.id}`);
    console.log(`Old Token  : ${n.oldTokenSnippet} (PURGED from database)`);
    console.log(`New Token  : ${n.newToken}`);
    console.log(`SHA-256    : ${n.tokenHash}`);
    console.log(`Action     : User must update VineScout Extension with the new token.`);
    console.log('-----------------------------------------------------------');
  }
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
