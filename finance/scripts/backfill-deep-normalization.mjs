// Backfill script for deep relational normalization on finance-os-db
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const financeDir = path.resolve(__dirname, '..');

const isRemote = process.argv.includes('--remote');
const targetFlag = isRemote ? '--remote' : '--local';

console.log(`Running deep normalization backfill on finance-os-db (${targetFlag})...`);

function runD1Json(query) {
  const cmd = `npx wrangler d1 execute finance-os-db ${targetFlag} --command="${query.replace(/"/g, '\\"')}" --json`;
  const stdout = execSync(cmd, { cwd: financeDir, encoding: 'utf8' });
  const parsed = JSON.parse(stdout);
  return parsed[0]?.results || [];
}

const accounts = runD1Json("SELECT ledger_id, id, extra_json FROM finance_accounts WHERE extra_json IS NOT NULL AND length(extra_json) > 10;");
console.log(`Found ${accounts.length} accounts to process.`);

const sqlStatements = [];

const STMT_ROW_KNOWN_KEYS = new Set([
  'regBeg', 'extraBeg', 'totalBeg', 'regEnd', 'extraEnd', 'totalEnd', 'bankBalance',
  'reg_beg', 'extra_beg', 'total_beg', 'reg_end', 'extra_end', 'total_end', 'bank_balance'
]);

const ACCOUNT_KNOWN_KEYS = new Set([
  'id', 'name', 'type', 'saveExtraMonthly', 'enableExtraSavings', 'color', 'notes',
  'startingBalance', 'extraStartingBalance', 'balanceAsOfDate', 'startDate', 'ledgerMode', 'isArchived',
  'importedLedgerRows', 'saveExtraSplits', 'overflowSplits', 'sortOrder'
]);

function extractUnknownFields(item, knownKeys) {
  if (!item || typeof item !== 'object') return '{}';
  const unknown = {};
  for (const [k, v] of Object.entries(item)) {
    if (!knownKeys.has(k) && v !== undefined) {
      unknown[k] = v;
    }
  }
  unknown._p = Object.keys(item);
  return JSON.stringify(unknown);
}

for (const accRow of accounts) {
  const ledgerId = accRow.ledger_id;
  const accountId = accRow.id;
  let extra;
  try {
    extra = JSON.parse(accRow.extra_json);
  } catch {
    continue;
  }
  if (!extra || typeof extra !== 'object') continue;

  // 1. Process importedLedgerRows
  if (extra.importedLedgerRows && typeof extra.importedLedgerRows === 'object') {
    const dates = Object.keys(extra.importedLedgerRows);
    console.log(`  Account ${accountId}: decomposing ${dates.length} statement rows...`);
    for (const [dateKey, row] of Object.entries(extra.importedLedgerRows)) {
      if (!row || typeof row !== 'object') continue;
      const regBeg = typeof row.regBeg === 'number' ? row.regBeg : (typeof row.reg_beg === 'number' ? row.reg_beg : null);
      const extraBeg = typeof row.extraBeg === 'number' ? row.extraBeg : (typeof row.extra_beg === 'number' ? row.extra_beg : null);
      const totalBeg = typeof row.totalBeg === 'number' ? row.totalBeg : (typeof row.total_beg === 'number' ? row.total_beg : null);
      const regEnd = typeof row.regEnd === 'number' ? row.regEnd : (typeof row.reg_end === 'number' ? row.reg_end : null);
      const extraEnd = typeof row.extraEnd === 'number' ? row.extraEnd : (typeof row.extra_end === 'number' ? row.extra_end : null);
      const totalEnd = typeof row.totalEnd === 'number' ? row.totalEnd : (typeof row.total_end === 'number' ? row.total_end : null);
      const bankBalance = typeof row.bankBalance === 'number' ? row.bankBalance : (typeof row.bank_balance === 'number' ? row.bank_balance : null);
      const rowExtra = JSON.stringify({});

      sqlStatements.push(
        `INSERT OR REPLACE INTO finance_account_statement_rows (
          ledger_id, account_id, date_key, reg_beg, extra_beg, total_beg, reg_end, extra_end, total_end, bank_balance, extra_json
        ) VALUES (
          '${ledgerId}', '${accountId}', '${dateKey}',
          ${regBeg !== null ? regBeg : 'NULL'}, ${extraBeg !== null ? extraBeg : 'NULL'}, ${totalBeg !== null ? totalBeg : 'NULL'},
          ${regEnd !== null ? regEnd : 'NULL'}, ${extraEnd !== null ? extraEnd : 'NULL'}, ${totalEnd !== null ? totalEnd : 'NULL'},
          ${bankBalance !== null ? bankBalance : 'NULL'}, '${rowExtra}'
        );`
      );
    }
  }

  // 2. Process saveExtraSplits
  if (extra.saveExtraSplits && typeof extra.saveExtraSplits === 'object') {
    for (const [personId, pct] of Object.entries(extra.saveExtraSplits)) {
      sqlStatements.push(
        `INSERT OR REPLACE INTO finance_account_splits (ledger_id, account_id, split_type, person_id, percentage) VALUES ('${ledgerId}', '${accountId}', 'save_extra', '${personId}', ${Number(pct) || 0});`
      );
    }
  }

  // 3. Process overflowSplits
  if (extra.overflowSplits && typeof extra.overflowSplits === 'object') {
    for (const [personId, pct] of Object.entries(extra.overflowSplits)) {
      sqlStatements.push(
        `INSERT OR REPLACE INTO finance_account_splits (ledger_id, account_id, split_type, person_id, percentage) VALUES ('${ledgerId}', '${accountId}', 'overflow', '${personId}', ${Number(pct) || 0});`
      );
    }
  }

  // 4. Update finance_accounts extra_json with delta-only + _p
  const newExtraJson = extractUnknownFields(extra, ACCOUNT_KNOWN_KEYS);
  sqlStatements.push(
    `UPDATE finance_accounts SET extra_json = '${newExtraJson.replace(/'/g, "''")}' WHERE ledger_id = '${ledgerId}' AND id = '${accountId}';`
  );
}

// 5. Process bill splits
const bills = runD1Json("SELECT ledger_id, id, splits_json, extra_json FROM finance_bills WHERE splits_json IS NOT NULL AND splits_json != '{}';");
console.log(`Found ${bills.length} bills with splits to process.`);
for (const b of bills) {
  let splits;
  try {
    splits = JSON.parse(b.splits_json);
  } catch {
    continue;
  }
  if (!splits || typeof splits !== 'object') continue;
  for (const [personId, pct] of Object.entries(splits)) {
    sqlStatements.push(
      `INSERT OR REPLACE INTO finance_bill_splits (ledger_id, bill_id, person_id, percentage) VALUES ('${b.ledger_id}', '${b.id}', '${personId}', ${Number(pct) || 0});`
    );
  }
}

// 6. Process people account allocations
const people = runD1Json("SELECT ledger_id, id, account_allocations, extra_json FROM finance_people WHERE account_allocations IS NOT NULL AND account_allocations != '{}';");
console.log(`Found ${people.length} people with allocations to process.`);
for (const p of people) {
  let alloc;
  try {
    alloc = JSON.parse(p.account_allocations);
  } catch {
    continue;
  }
  if (!alloc || typeof alloc !== 'object') continue;
  for (const [accountId, allocVal] of Object.entries(alloc)) {
    sqlStatements.push(
      `INSERT OR REPLACE INTO finance_person_allocations (ledger_id, person_id, account_id, allocation_value) VALUES ('${p.ledger_id}', '${p.id}', '${accountId}', ${Number(allocVal) || 0});`
    );
  }
}

console.log(`Generated ${sqlStatements.length} total normalization SQL statements.`);

// Execute statements in batches of 80
const BATCH_SIZE = 80;
for (let i = 0; i < sqlStatements.length; i += BATCH_SIZE) {
  const batch = sqlStatements.slice(i, i + BATCH_SIZE);
  const tempSqlFile = path.resolve(financeDir, `_temp_backfill_batch_${i}.sql`);
  fs.writeFileSync(tempSqlFile, batch.join('\n'), 'utf8');
  try {
    execSync(`npx wrangler d1 execute finance-os-db ${targetFlag} --file="${tempSqlFile}"`, { cwd: financeDir, stdio: 'inherit' });
  } finally {
    if (fs.existsSync(tempSqlFile)) {
      fs.unlinkSync(tempSqlFile);
    }
  }
}

console.log('Backfill complete!');

