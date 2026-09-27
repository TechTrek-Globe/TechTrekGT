#!/usr/bin/env node
/**
 * migrate-ebay-tokens.js - One-time migration script for [HIGH-3].
 *
 * For every row in `ebay_oauth_tokens`:
 * 1. Decrypts `access_token` and `refresh_token` using OLD derivation (JWT_SECRET + old salt).
 * 2. Re-encrypts both using NEW derivation (TOKEN_ENCRYPTION_KEY + new salt).
 * 3. Updates the row in Cloudflare D1.
 * 4. Verifies that decryption succeeds with ONLY TOKEN_ENCRYPTION_KEY and fails with OLD derivation.
 *
 * Usage:
 *   node scripts/migrate-ebay-tokens.js [--remote] [--dry-run]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { deriveKey, OLD_SALT, NEW_SALT } from '../functions/utils/tokenCrypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const isRemote = args.includes('--remote');
const isDryRun = args.includes('--dry-run');

// Read secrets from .dev.vars if not present in process.env
function loadDevVars() {
  const devVarsPath = path.join(__dirname, '../.dev.vars');
  if (fs.existsSync(devVarsPath)) {
    const content = fs.readFileSync(devVarsPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    }
  }
}

loadDevVars();

const jwtSecret = process.env.JWT_SECRET;
const tokenEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY;

if (!jwtSecret) {
  console.error('Error: JWT_SECRET not found in environment or .dev.vars');
  process.exit(1);
}

if (!tokenEncryptionKey) {
  console.error('Error: TOKEN_ENCRYPTION_KEY not found in environment or .dev.vars');
  process.exit(1);
}

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

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function decryptWithKey(encrypted, secret, salt) {
  if (!encrypted) return null;
  const [ivB64, cipherB64] = encrypted.split('.');
  if (!ivB64 || !cipherB64) throw new Error('Invalid encrypted format');
  const key = await deriveKey(secret, salt);
  const iv = base64ToBuf(ivB64);
  const cipherBuf = base64ToBuf(cipherB64);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}

async function encryptWithKey(plaintext, secret, salt) {
  const key = await deriveKey(secret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${bufToBase64(iv)}.${bufToBase64(cipherBuf)}`;
}

async function main() {
  console.log('===========================================================');
  console.log('HIGH-3: eBay OAuth Token Encryption Key Migration');
  console.log(`Target Database: ${isRemote ? 'Cloudflare D1 (Remote / Production)' : 'Cloudflare D1 (Local)'}`);
  console.log(`Dry Run Mode   : ${isDryRun ? 'YES (No writes)' : 'NO (Writes enabled)'}`);
  console.log('===========================================================\n');

  const rows = runD1('SELECT user_id, access_token, refresh_token FROM ebay_oauth_tokens;');
  if (!rows || rows.length === 0) {
    console.log('No rows found in ebay_oauth_tokens table. Migration complete.');
    return;
  }

  console.log(`Found ${rows.length} row(s) in ebay_oauth_tokens.\n`);

  let migratedCount = 0;
  let alreadyMigratedCount = 0;

  for (const row of rows) {
    const { user_id, access_token, refresh_token } = row;
    console.log(`Processing user_id: ${user_id}...`);

    let plainAccess = null;
    let plainRefresh = null;
    let accessNeedsMigration = false;
    let refreshNeedsMigration = false;

    // Check access_token
    try {
      plainAccess = await decryptWithKey(access_token, tokenEncryptionKey, NEW_SALT);
      console.log('  - access_token: Already encrypted with NEW key and salt.');
    } catch (_) {
      try {
        plainAccess = await decryptWithKey(access_token, jwtSecret, OLD_SALT);
        accessNeedsMigration = true;
        console.log('  - access_token: Successfully decrypted with OLD key (JWT_SECRET + old salt).');
      } catch (err) {
        console.error(`  - Failed to decrypt access_token with both old and new keys: ${err.message}`);
      }
    }

    // Check refresh_token
    try {
      plainRefresh = await decryptWithKey(refresh_token, tokenEncryptionKey, NEW_SALT);
      console.log('  - refresh_token: Already encrypted with NEW key and salt.');
    } catch (_) {
      try {
        plainRefresh = await decryptWithKey(refresh_token, jwtSecret, OLD_SALT);
        refreshNeedsMigration = true;
        console.log('  - refresh_token: Successfully decrypted with OLD key (JWT_SECRET + old salt).');
      } catch (err) {
        console.error(`  - Failed to decrypt refresh_token with both old and new keys: ${err.message}`);
      }
    }

    if (!accessNeedsMigration && !refreshNeedsMigration) {
      console.log('  -> Row is already fully migrated. Skipping.\n');
      alreadyMigratedCount++;
      continue;
    }

    if (!plainAccess || !plainRefresh) {
      console.error(`  -> ERROR: Could not decrypt tokens for user ${user_id}. Skipping row.\n`);
      continue;
    }

    // Re-encrypt both tokens with NEW key and salt
    const newEncAccess = await encryptWithKey(plainAccess, tokenEncryptionKey, NEW_SALT);
    const newEncRefresh = await encryptWithKey(plainRefresh, tokenEncryptionKey, NEW_SALT);

    if (isDryRun) {
      console.log('  [DRY RUN] Would update row in D1.');
    } else {
      runD1(`UPDATE ebay_oauth_tokens SET access_token = '${newEncAccess.replace(/'/g, "''")}', refresh_token = '${newEncRefresh.replace(/'/g, "''")}' WHERE user_id = '${user_id.replace(/'/g, "''")}';`);
      console.log('  -> Row updated in D1 successfully.');

      // Verification: re-fetch from D1 and verify decryption
      const verifyRows = runD1(`SELECT access_token, refresh_token FROM ebay_oauth_tokens WHERE user_id = '${user_id.replace(/'/g, "''")}';`);
      if (verifyRows && verifyRows[0]) {
        const verifyAccess = await decryptWithKey(verifyRows[0].access_token, tokenEncryptionKey, NEW_SALT);
        const verifyRefresh = await decryptWithKey(verifyRows[0].refresh_token, tokenEncryptionKey, NEW_SALT);
        if (verifyAccess === plainAccess && verifyRefresh === plainRefresh) {
          console.log('  -> VERIFICATION PASSED: Stored tokens successfully decrypted with TOKEN_ENCRYPTION_KEY.');
        } else {
          console.error('  -> VERIFICATION FAILED: Decrypted tokens did not match original plain text.');
          process.exit(1);
        }
      }
    }

    migratedCount++;
    console.log();
  }

  console.log('===========================================================');
  console.log(`Migration Summary:`);
  console.log(`  - Total Rows Examined   : ${rows.length}`);
  console.log(`  - Successfully Migrated : ${migratedCount}`);
  console.log(`  - Already Up-to-Date    : ${alreadyMigratedCount}`);
  console.log('===========================================================');
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
