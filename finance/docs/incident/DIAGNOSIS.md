# Incident Diagnosis - Deposit Display Regression and Related Defects

> Branch: hotfix/deposits-and-integrity
> Baseline: 259 tests pass, 0 fail (commit 498ecae9)
> Analysis date: 2026-10-01

## Phase 1: Root Cause Summary

### P1 Root Cause (CRITICAL): allocateEarnerCredit called without dailyMatrix

Both call sites pass empty/undefined dailyMatrix:

- LedgerView.jsx:781  -> allocateEarnerCredit(p, selectedAccountId, year, month, day, budget, undefined, { isLockedDay })
- LedgerDataContext.jsx:966 -> allocateEarnerCredit(p, accountId, year, month, day, metadataStateRef.current, {}, { isLockedDay })

In ledgerEngine.js:14: const c = dailyMatrix[key]; -- with dailyMatrix={}, c is always undefined,
so the function always falls back to projectedDeposit, ignoring stored credit cells.

Fix: pass dailyMatrixRef.current (getDailyMatrix()) at both call sites.

### P4 Root Cause (HIGH): owner_id not in ALLOWED_BUDGET_KEYS

indexedDB.js:118 and api.js:197 both write budgetData.owner_id = userId.
worker.js ALLOWED_BUDGET_KEYS does not include owner_id.
validateBudgetPayload rejects payloads with unknown keys -> HTTP 400.
Fix: strip owner_id before the API call in pushCloudBackupOptimistic.

### P2 Root Cause (CRITICAL): migrateFundingGoals corrupts amounts

BudgetMetadataContext.jsx:62-65 hardcodes amount corrections:
  if (Math.abs(amountPerPay - 1222.61) < 0.01) amountPerPay = 1378.00;
  if (Math.abs(amountPerPay - 689.42) < 0.01) amountPerPay = 689.00;
This silently mutates stored goal amounts on every load.
Fix: remove hardcoded self-heal corrections (Tier C5 for versioned migration).

### P6 Root Cause (HIGH): Import lock covers future dates

LedgerView.jsx:771 and LedgerDataContext.jsx:960:
  isLockedDay = isImportMode && maxImportDateStr && isoDate <= maxImportDateStr
maxImportDateStr = 2027-06-06, today = 2026-10-01.
All dates 2026-10-02 through 2027-06-06 are locked -> no projected deposits shown.
Fix: effectiveLockEnd = min(maxImportDateStr, todayStr).

### P8 Root Cause (HIGH): LedgerView uses parseInt(b.dueDay) not effectiveDueDay

LedgerView.jsx:816,820 still uses parseInt(b.dueDay) === day (literal match).
LedgerDataContext was fixed in 498ecae9 to use effectiveDueDay(b,y,m) but LedgerView was not.
Fix: update LedgerView to use effectiveDueDay(b, year, month) === day.

### P14 Root Cause (HIGH): OTP codes logged in devFallbackMessage

functions/utils/auth.js:767,792,810 devFallbackMessage strings include real codes and emails.
Fix: redact code and email from logs outside explicit ENVIRONMENT!==production dev mode.

### P13 Status: Already Fixed

AuthContext.jsx login/register throw isNetworkError - no offline bypass remains.

## Tier C Items (Report Only)

C1 - Bi-weekly pay model ambiguity (owner decision needed)
C2 - saveExtraMonthly vs goal overflow (owner clarification needed)
C3 - Stored future credit cells 689.42 / 1222.61 (owner to decide clear vs keep)
C4 - Deleted fundingGoals recovery (owner to re-enter manually)
C5 - Hardcoded dollar self-heal migrations (propose versioned migration plan)
C6 - Cloud backup consent vs default-on
C7 - CSP report-only (Cloudflare dashboard rule)
C8 - Invalid day key 2026-09_31 (do not delete; list for owner review)
