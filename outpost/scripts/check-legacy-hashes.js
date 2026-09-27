#!/usr/bin/env node
/**
 * check-legacy-hashes.js - Audit and migration script for [HIGH-6].
 *
 * Scans `users` table in Cloudflare D1 for non-compliant legacy password hashes
 * (any hash that does not conform to the 3-part "salt:iterations:hash" format).
 *
 * For any account with a non-3-part hash:
 * - Flags the account with `force_password_reset = 1`.
 * - Prevents silent lockout / guessing iteration counts.
 * - Forces the user to reset their password via /reset-password at next login.
 *
 * Usage:
 *   node scripts/check-legacy-hashes.js [--remote] [--dry-run]
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

function isThreePartHash(storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [saltHex, iterationsStr, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  return Boolean(
    saltHex &&
    saltHex.length === 32 &&
    hashHex &&
    hashHex.length === 64 &&
    Number.isInteger(iterations) &&
    iterations >= 1000
  );
}

async function main() {
  console.log('===========================================================');
  console.log('HIGH-6: PBKDF2 Password Hash Format Audit & Migration');
  console.log(`Target Database: ${isRemote ? 'Cloudflare D1 (Remote / Production)' : 'Cloudflare D1 (Local)'}`);
  console.log(`Dry Run Mode   : ${isDryRun ? 'YES (No writes)' : 'NO (Writes enabled)'}`);
  console.log('===========================================================\n');

  // Step 1: Ensure force_password_reset column exists
  console.log('Checking users.force_password_reset column...');
  const tableInfo = runD1('PRAGMA table_info(users);');
  const hasCol = tableInfo.some(c => c.name === 'force_password_reset');
  if (!hasCol) {
    if (isDryRun) {
      console.log('  [DRY RUN] Would execute: ALTER TABLE users ADD COLUMN force_password_reset INTEGER NOT NULL DEFAULT 0;');
    } else {
      runD1('ALTER TABLE users ADD COLUMN force_password_reset INTEGER NOT NULL DEFAULT 0;');
      console.log('  -> Added column users.force_password_reset successfully.\n');
    }
  } else {
    console.log('  -> Column users.force_password_reset is present.\n');
  }

  // Step 2: Query all users and evaluate password hashes
  const rows = runD1('SELECT id, email, password_hash, force_password_reset FROM users;');
  if (!rows || rows.length === 0) {
    console.log('No user rows found in database.');
    return;
  }

  console.log(`Auditing ${rows.length} user account(s) for PBKDF2 hash compliance:\n`);

  let compliantCount = 0;
  let nonCompliantCount = 0;

  for (const row of rows) {
    const { id, email, password_hash, force_password_reset } = row;
    const isCompliant = isThreePartHash(password_hash);

    if (isCompliant) {
      const parts = password_hash.split(':');
      console.log(`[COMPLIANT] ${email} (${id}) - Valid 3-part format (cost: ${parts[1]} iterations)`);
      compliantCount++;
    } else {
      console.log(`[NON-COMPLIANT] ${email} (${id}) - Non-3-part format detected: "${password_hash}"`);
      if (force_password_reset === 1) {
        console.log('  -> Already flagged with force_password_reset = 1.');
      } else if (isDryRun) {
        console.log('  [DRY RUN] Would set force_password_reset = 1 in database.');
      } else {
        runD1(`UPDATE users SET force_password_reset = 1 WHERE id = '${id}';`);
        console.log('  -> Flagged with force_password_reset = 1. User will be redirected to reset password at next login.');
      }
      nonCompliantCount++;
    }
  }

  console.log('\n===========================================================');
  console.log('Audit Summary:');
  console.log(`  - Total Accounts Scanned   : ${rows.length}`);
  console.log(`  - Compliant 3-Part Hashes  : ${compliantCount}`);
  console.log(`  - Non-Compliant / Flagged  : ${nonCompliantCount}`);
  console.log('===========================================================');

  if (nonCompliantCount === 0) {
    console.log('All user accounts possess valid 3-part PBKDF2 password hashes.');
    console.log('No accounts require forced password resets.');
  } else {
    console.log(`ACTION REQUIRED: ${nonCompliantCount} account(s) flagged for mandatory password reset.`);
  }
}

main().catch(err => {
  console.error('Audit script error:', err);
  process.exit(1);
});
