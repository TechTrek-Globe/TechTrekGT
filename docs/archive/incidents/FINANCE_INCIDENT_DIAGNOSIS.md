# [RESOLVED] Incident Diagnosis - Deposit Display Regression and Related Defects

> Branch: hotfix/deposits-and-integrity
> Baseline: 259 tests pass, 0 fail (commit 498ecae9)
> Analysis date: 2026-10-01
> Final suite: 274 tests pass, 0 fail (ae5b5bd7)

---

## Tier A - Completed (commits 9898ec99 / 22518f20 / 9531cff3 / a3358b87)

| ID | Fix | Commit |
|----|-----|--------|
| P1 DEP-001 | Pass dailyMatrix to allocateEarnerCredit at both call sites | 9898ec99 |
| P2 FG-001 | Remove hardcoded goal amount self-heal mutations | 22518f20 |
| P3 SYNC-001 | Scope version markers to userId; protect fundingGoals from silent overwrite | a3358b87 |
| P4 SYNC-002 | Strip owner_id from backup payload before API call | 22518f20 |
| P6 LOCK-001 | Clamp import lock to today (effectiveLockEnd = min(maxImport, today)) | 9898ec99 |
| P8 BILL-001 | Use effectiveDueDay in LedgerView bill matching | 9898ec99 |
| P11-a REACT-001-a | Remove updateDailyMatrixCell state write from inside useMemo | 9898ec99 |
| P12-a UI-001-a | Preserve starting balance on clearAccountTransactions | a3358b87 |
| P14 SEC-001 | Redact OTP codes and emails from production logs | a3358b87 |
| P15 AUTH-002 | Proactive token refresh every 90 min + visibilitychange | 9531cff3 |

## Tier B - Completed (commit ae5b5bd7)

| ID | Fix | Tests |
|----|-----|-------|
| P7 IMP-001 | Clamp importer zero-out payday key to daysInMonth | 4 new tests |
| P9 BILL-002 | Add !b.isArchived filter to all 6 bill total functions | 5 new tests |
| P10 CALC-001 | Stored credit with no extra_credit cell -> earnerExtra=0 (no projected split) | 6 new tests |

## Tier C Items (Reviewed & Audited - See docs/incident/REPORT.md)

| ID | Item | Status / Finding | Recommendation |
|----|------|------------------|----------------|
| C1 | Bi-weekly pay model ambiguity | Audited in `paydayUtils.js` | Enforce explicit `anchorDate` for 14-day rolling cadence |
| C2 | saveExtraMonthly vs goal overflow edge case | Audited | Goal-driven overflow supersedes `saveExtraMonthly` when active |
| C3 | Stored future credit cells 689.42 / 1222.61 (2026-10 to 2027-06) | Resolved | Option A auto-migration + Settings reset button (`StorageResetSubPanel`) |
| C4 | Deleted fundingGoals recovery | Documented | Protected from overwrite; owner can safely re-enter in Settings |
| C5 | Versioned migration plan for goal frequency normalization | Architecture Proposed | Adopt `metadata.schemaVersion` sequential migration runner |
| C6 | Cloud backup consent vs default-on UX | Audited | Add first-login prompt: Local-Only vs Encrypted Cloud Vault |
| C7 | CSP report-only mode | Audited in `worker.js` | Maintain strict CSP with Turnstile allowlist; use report-only for WAF changes |
| C8 | Orphaned invalid day keys (Feb 30/31, Apr 31, Jun 31, Sep 31) | Audited: 22 zero-value keys in DB | Safe to prune via optional "Prune Calendar Ghosts" tool |


## Root Cause Summary

### P1 (CRITICAL): allocateEarnerCredit called without dailyMatrix
Both call sites passed empty/undefined dailyMatrix; c was always undefined so
the function always returned projectedDeposit, ignoring stored credit cells.
Fixed: pass getDailyMatrix() / dailyMatrixRef.current at both call sites.

### P4 (HIGH): owner_id not in ALLOWED_BUDGET_KEYS
api.js writes budgetData.owner_id = userId. worker.js ALLOWED_BUDGET_KEYS does
not include owner_id. validateBudgetPayload rejected every backup with HTTP 400.
Fixed: shallow-copy budget, delete uploadPayload.owner_id before the API call.

### P10 (HIGH): allocateEarnerCredit split stored credit using projected extra amounts
When c (stored credit) was set but ec (extra_credit) was not, the engine calculated
earnerExtra from projected amounts, double-applying the extra savings deduction on an
already-settled import. Fixed: stored credit + no extra_credit -> earnerExtra = 0.

### P7 (MEDIUM): Importer wrote day-31 zero keys in 30-day months
payDay2='last' was hardcoded to 31 in the zero-out path, creating orphaned keys
like 2026-09_31_credit_... in September. Fixed: clamp numericPayDay to daysInTxnMonth.

### P9 (MEDIUM): Archived bills included in all expense totals
Six functions and the balance simulation included isArchived:true bills.
Fixed: added !b.isArchived filter before each reduce/simulation loop.

