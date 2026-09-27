#!/usr/bin/env node
/**
 * manage-integrations.js - Admin CLI script to issue, list, and revoke API integration secrets.
 *
 * Implements [HIGH-2]: Per-user / per-device API integration secrets.
 *
 * Usage:
 *   node scripts/manage-integrations.js list [--remote]
 *   node scripts/manage-integrations.js list <user_id_or_email> [--remote]
 *   node scripts/manage-integrations.js issue <user_id_or_email> [label] [--remote]
 *   node scripts/manage-integrations.js revoke <integration_id> [--remote]
 */

import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const isRemote = args.includes('--remote');
const cleanArgs = args.filter(a => a !== '--remote');
const command = cleanArgs[0];

function runD1(sql) {
  const remoteFlag = isRemote ? '--remote' : '--local';
  const escapedSql = sql.replace(/"/g, '\\"');
  const cmd = `npx wrangler d1 execute personal-budget-db ${remoteFlag} --command="${escapedSql}"`;
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    // Parse json output from wrangler d1 execute if possible
    const match = stdout.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed[0]?.results || [];
    }
    return stdout;
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    console.error('D1 execution failed:', stderr);
    process.exit(1);
  }
}

async function resolveUserId(userIdentifier) {
  if (!userIdentifier) return null;
  // If it looks like an email:
  if (userIdentifier.includes('@')) {
    const results = runD1(`SELECT id FROM users WHERE email = '${userIdentifier.replace(/'/g, "''")}' LIMIT 1`);
    if (Array.isArray(results) && results[0]?.id) {
      return results[0].id;
    }
    console.error(`User with email "${userIdentifier}" not found.`);
    process.exit(1);
  }
  // Otherwise assume user_id
  const results = runD1(`SELECT id FROM users WHERE id = '${userIdentifier.replace(/'/g, "''")}' LIMIT 1`);
  if (Array.isArray(results) && results[0]?.id) {
    return results[0].id;
  }
  // If no match found by ID, return the string as provided if it exists in users
  return userIdentifier;
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret.trim()).digest('hex');
}

function generateSecret() {
  const bytes = crypto.randomBytes(32);
  return `op_sec_${bytes.toString('hex')}`;
}

async function main() {
  if (!command || command === 'help') {
    console.log(`
Usage:
  node scripts/manage-integrations.js list [user_id_or_email] [--remote]
  node scripts/manage-integrations.js issue <user_id_or_email> [label] [--remote]
  node scripts/manage-integrations.js revoke <integration_id> [--remote]
`);
    return;
  }

  if (command === 'list') {
    const target = cleanArgs[1];
    let sql = 'SELECT id, user_id, label, created_at, revoked_at FROM api_integrations';
    if (target) {
      const userId = await resolveUserId(target);
      sql += ` WHERE user_id = '${userId.replace(/'/g, "''")}'`;
    }
    sql += ' ORDER BY created_at DESC';
    const results = runD1(sql);
    console.log('\n--- Active & Revoked API Integrations ---');
    console.table(results);
    return;
  }

  if (command === 'issue') {
    const target = cleanArgs[1];
    if (!target) {
      console.error('Error: user_id or email is required to issue a secret.');
      process.exit(1);
    }
    const label = cleanArgs[2] || 'CLI Integration';
    const userId = await resolveUserId(target);
    const id = crypto.randomUUID();
    const rawSecret = generateSecret();
    const secretHash = hashSecret(rawSecret);

    const sql = `INSERT INTO api_integrations (id, user_id, secret_hash, label, created_at) VALUES ('${id}', '${userId.replace(/'/g, "''")}', '${secretHash}', '${label.replace(/'/g, "''")}', datetime('now'))`;
    runD1(sql);

    console.log('\n======================================================');
    console.log('SUCCESS: API Integration Secret Issued');
    console.log('======================================================');
    console.log(`Integration ID : ${id}`);
    console.log(`User ID        : ${userId}`);
    console.log(`Label          : ${label}`);
    console.log(`Target DB      : ${isRemote ? 'Cloudflare D1 (Remote / Production)' : 'Cloudflare D1 (Local)'}`);
    console.log('------------------------------------------------------');
    console.log(`API SECRET KEY : ${rawSecret}`);
    console.log('------------------------------------------------------');
    console.log('IMPORTANT: Store this key securely. It cannot be recovered once lost.');
    console.log('Use in HTTP requests via:');
    console.log('  Authorization: Bearer ' + rawSecret);
    console.log('  OR X-VineScout-Auth: ' + rawSecret);
    console.log('======================================================\n');
    return;
  }

  if (command === 'revoke') {
    const integrationId = cleanArgs[1];
    if (!integrationId) {
      console.error('Error: integration_id is required to revoke.');
      process.exit(1);
    }
    const sql = `UPDATE api_integrations SET revoked_at = datetime('now') WHERE id = '${integrationId.replace(/'/g, "''")}'`;
    runD1(sql);
    console.log(`\nIntegration ${integrationId} revoked successfully.`);
    return;
  }

  console.error(`Unknown command: ${command}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
