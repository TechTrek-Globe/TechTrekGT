# Finance OS - Automated Test Suite Implementation Plan
## Vitest Edge Integration, Precision Invariants, and Playwright Chaos E2E Testing

---

## 1. Executive Summary & Architecture Strategy

This implementation plan defines the complete engineering specification for transforming the static audit findings and remediation directives of **TechTrekGT - Finance OS** (`e:/TechTrekGT/finance`) into an executable, zero-flake automated test suite.

The test architecture is designed to enforce strict compliance with Finance OS stack rules:
- **Pure JavaScript (ESM) Exclusively**: Strictly zero TypeScript (`.ts`/`.tsx`). All configs, test scripts, fixtures, and utilities are written in pure ES Modules (`.js`).
- **Dual-Tier Test Topology**:
  1. **Edge Integration & Unit Tests (`finance/tests/`)**: Powered by Vitest with Cloudflare Workers pool (`@cloudflare/vitest-pool-workers`) alongside Node.js test runner, asserting algorithmic precision, D1 SQLite parameter binding, WebCrypto PBKDF2/HMAC security, and Compare-And-Swap (CAS) optimistic concurrency.
  2. **Distributed Browser E2E & Chaos Testing (`finance/e2e/`)**: Powered by Playwright, exercising real browser rendering, client-side SPA routing, IndexedDB persistence, network disruption (`page.route()`), offline queue drainage, and UI lifecycle recovery.
- **Audit Invariant Guardrails**: Direct regression protection covering FIN-AUDIT-001 (SQL parameterization & compensating rollbacks), FIN-AUDIT-002 (session invalidation & cookie purging), FIN-AUDIT-003 (`round2()` precision & IEEE 754 drift prevention), and FIN-AUDIT-004 (user-scoped state isolation & loading recovery).

---

## 2. Test Coverage Mapping Matrix

| Audit Issue / Directive | Target Test File | Test Runner & Layer | Invariant & Assertion Scope |
| :--- | :--- | :--- | :--- |
| **FIN-AUDIT-001**<br>SQL Parameterization & Rollbacks | `finance/tests/edge-d1-parameterization.test.js` | Vitest / Edge Integration | Validates `db.prepare().bind()` with `?` positional parameters across all endpoints. Proves rejection of SQL injection strings. Validates compensating rollbacks in `handleSyncBackup`, `register`, and `update-profile` on simulated D1 query errors. |
| **FIN-AUDIT-002**<br>Auth Lifecycle & Cookie Purging | `finance/tests/edge-auth-invalidation.test.js` | Vitest / Edge Integration | Asserts 401/403 responses issue `Set-Cookie: auth_token=; Max-Age=0` across `/finance`, `/api`, and `/`. Verifies `token_version` invalidation rejects stale JWTs. Asserts `env.GATEWAY_KV` resolution prior to `USER_CACHE` fallback. |
| **FIN-AUDIT-003**<br>Financial Math Precision | `finance/tests/unit-financial-precision.test.js` | Vitest / Algorithmic Unit | Asserts `round2()` boundary handling with `Number.EPSILON` across half-cent values (`1.005 -> 1.01`, `-1.005 -> -1.01`), `-0` normalization to `0`, 360-month amortization calculations without penny accumulation drift, and exact earner credit conservation (`earnerReg + earnerExtra === earnerDeposit`). |
| **FIN-AUDIT-004**<br>User Scoping & Loading Safety | `finance/tests/unit-user-scoping.test.js` | Vitest / Client Unit | Asserts IndexedDB key isolation: `current_budget:${userId}`, `cf_pending_sync:${userId}`, and `tt_budget_cloud_version:${userId}`. Verifies that sign-out cleans all user memory buffers. |
| **BUG-001**<br>Dead Assignment in Migrations | `finance/tests/unit-migrations-lint.test.js` | Vitest / Unit | Validates that `runBudgetMigrations` executes cleanly through V8 without dead variable assignments, passing ESLint validation without warnings. |
| **BUG-002**<br>Temporal Test Decay | `finance/tests/fix-02-no-auto-delete-credits.test.js` | Vitest / Unit | Validates pinned baseline dates in `oldPruneLogic` so tests never fail due to system clock progression. |
| **BUG-003**<br>10-Snapshot Vault Retention | `finance/tests/edge-cas-vault-retention.test.js` | Vitest / Edge Integration | Tests `handleSyncBackup` and `handleSyncVersions` enforcing `LIMIT 10` on `user_backup_versions`. Verifies the 11th manual snapshot prunes the oldest version while keeping ongoing sync intact. |
| **BUG-004 to BUG-007**<br>Raw Math.round Elimination | `finance/tests/unit-financial-precision.test.js` | Vitest / Unit | Verifies `LedgerView`, `spreadsheetParser`, `spreadsheet`, and `AmortizationView` use `round2()` exclusively without raw `Math.round(x * 100) / 100`. |
| **BUG-008**<br>GATEWAY_KV Binding Support | `finance/tests/edge-auth-invalidation.test.js` | Vitest / Edge Integration | Validates `getCachedUser`, `setCachedUser`, and `invalidateCachedUser` correctly read and write to `env.GATEWAY_KV`. |
| **BUG-009**<br>ESM Mid-File Import Cleanup | `finance/tests/unit-esm-syntax.test.js` | Vitest / Static Analysis | Verifies AST and static imports in `App.jsx` and `indexedDB.js` have zero mid-file imports. |
| **BUG-010**<br>SpreadsheetImporter Finally Block | `finance/e2e/importer-lifecycle.spec.js` | Playwright / Browser E2E | Simulates unhandled parsing exceptions during file upload. Asserts UI spinner clears and resets to `STAGE.IDLE` via `finally {}`. |
| **BUG-011**<br>Admin Telemetry Version Counting | `finance/tests/edge-admin-stats.test.js` | Vitest / Edge Integration | Verifies `/api/admin/stats` aggregates `user_backup_versions` row counts accurately per user. |
| **CAS Concurrency**<br>Optimistic Locking & Shrink | `finance/tests/edge-cas-concurrency.test.js` | Vitest / Edge Integration | Simulates concurrent writes with stale `baseVersion`, asserting HTTP 409 `SYNC_CONFLICT`. Tests shrink defense (<10%), asserting HTTP 409 `SYNC_SUSPICIOUS` unless `force: true`. Verifies UTF-8 byte tracking via `TextEncoder`. |
| **Network Chaos**<br>Offline Queue & Drainage | `finance/e2e/network-resilience.spec.js` | Playwright / Chaos E2E | Intercepts routes via `page.route()` to drop requests. Asserts local IndexedDB mutations queue in `cf_pending_sync:${userId}`. Restores network and verifies automatic queue replay and D1 persistence. |
| **Security & Routing**<br>Session Purge on Logout | `finance/e2e/session-security.spec.js` | Playwright / Browser E2E | Verifies dispatch of `techtrek:user-logout` window event completely flushes React state and resets views to landing page. |

---

## 3. Test Suite Implementation Architecture

### 3.1 Directory Structure & File Manifest

The test suite will reside inside `finance/tests/` (unit and edge integration) and `finance/e2e/` (browser end-to-end):

```text
finance/
├── vitest.config.js                   # Vitest configuration for Cloudflare Workers pool & pure JS ESM
├── playwright.config.js               # Playwright configuration (Chromium, Firefox, WebKit, mobile viewports)
├── tests/
│   ├── helpers/
│   │   ├── mockD1.js                  # In-memory SQLite mock matching Cloudflare D1 API (prepare, bind, first, all, run, batch)
│   │   ├── mockKV.js                  # In-memory Cloudflare KV namespace mock (get, put, delete)
│   │   ├── mockWorkerContext.js       # Cloudflare Worker execution context and environment constructor
│   │   └── hostilePayloads.js        # Malformed SQL, oversized JSON, and edge-case numerical fixtures
│   ├── unit-financial-precision.test.js  # FIN-AUDIT-003: round2, Number.EPSILON, -0 normalization, 360-month amortization
│   ├── unit-input-sanitization.test.js   # Taint & hostile payload testing for parsers and money validators
│   ├── unit-user-scoping.test.js         # FIN-AUDIT-004: User-scoped storage keys & multi-account cache isolation
│   ├── unit-esm-syntax.test.js           # BUG-009: AST validation for top-level imports in App.jsx and indexedDB.js
│   ├── edge-cas-concurrency.test.js      # CAS optimistic locking, UTF-8 length checks, shrink defense
│   ├── edge-cas-vault-retention.test.js  # BUG-003: 10-snapshot backup retention and pruning limits
│   ├── edge-auth-invalidation.test.js    # FIN-AUDIT-002 & BUG-008: Cookie purging, token_version bump, GATEWAY_KV
│   ├── edge-d1-parameterization.test.js  # FIN-AUDIT-001: SQL query positional parameter inspection
│   └── edge-admin-stats.test.js          # BUG-011: user_backup_versions telemetry aggregation
└── e2e/
    ├── fixtures/
    │   ├── auth.fixture.js            # Playwright authenticated session helper (sets mock auth_token and csrf_token)
    │   └── test-budgets.js            # Deterministic budget fixtures (accounts, bills, daily matrix)
    ├── ui-reachability.spec.js        # Navigation across Dashboard, Main Budget, Ledger, Amortization, Settings
    ├── network-resilience.spec.js     # Chaos test: route interception, offline queueing, reconnection flush
    ├── importer-lifecycle.spec.js     # BUG-010: SpreadsheetImporter parsing, error injection, finally recovery
    └── session-security.spec.js       # Protected route guards and techtrek:user-logout state purging
```

---

## 4. Detailed Component & Test Specifications

### 4.1 Vitest & Worker Pool Configuration (`finance/vitest.config.js`)
Configured to execute ESM `.js` files using the Cloudflare Workers pool or Node.js environment with native WebCrypto and in-memory SQLite bindings:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.js'],
    exclude: ['tests/fixtures/**', 'node_modules/**'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/utils/**', 'functions/utils/**', 'src/migrations/**']
    }
  }
});
```

### 4.2 Playwright Configuration (`finance/playwright.config.js`)
Configured to validate desktop and mobile web experiences against the local Vite development server:

```javascript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000/finance/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/finance/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
```

### 4.3 Unit Test Specifications (`finance/tests/`)

#### 1. `tests/unit-financial-precision.test.js`
- **Goal**: Guarantee zero penny drift and verify FIN-AUDIT-003 compliance.
- **Test Scenarios**:
  1. `round2()` Half-Cent Rounding:
     - Verify `round2(1.005) === 1.01` (prevents IEEE 754 float flooring where `1.005 * 100 = 100.49999999999999`).
     - Verify `round2(-1.005) === -1.01` (symmetric negative rounding).
     - Verify `round2(1.055) === 1.06` and `round2(2.555) === 2.56`.
  2. Negative Zero Normalization:
     - Verify `round2(-0.0001) === 0` and `Object.is(round2(-0.0001), 0) === true` (never `-0`).
     - Verify `round2(0 * -1) === 0` and `Object.is(round2(0 * -1), -0) === false`.
  3. 360-Month Amortization Calculation Integrity:
     - Simulate a $400,000 loan at 6.5% interest over 360 periods using period payment math.
     - Accumulate principal and interest using `round2()` at each period.
     - Assert ending balance reaches exact `0.00` without cumulative floating-point penny divergence.
  4. Earner Credit Allocation Invariant:
     - Verify `allocateEarnerCredit()` maintains `earnerReg + earnerExtra === earnerDeposit` across split earner plans.
     - Ensure extra savings clamping prevents negative or surplus penny allocation.

#### 2. `tests/unit-input-sanitization.test.js`
- **Goal**: Assert input parsers resist malformed and hostile payloads.
- **Test Scenarios**:
  1. Money Input Sanitization:
     - Test `parseMoney()` with hostile strings: `"$1,234.56"`, `"($45.00)"`, `"--100"`, `"1.2.3"`, `"NaN"`, `"Infinity"`, `"<script>alert(1)</script>"`, and SQL injection `' OR '1'='1`.
     - Confirm all malformed inputs resolve safely to `0` or numeric fallback without exceptions.
  2. Oversized Payload Clamp:
     - Test `validateBudgetPayloadDetailed()` with budget payloads exceeding 25,000 transactions or 10,000 line items.
     - Confirm validator rejects with structured validation errors.

#### 3. `tests/edge-cas-concurrency.test.js`
- **Goal**: Validate optimistic locking, UTF-8 length tracking, and shrink defense in Cloud Vault.
- **Test Scenarios**:
  1. Optimistic Locking Conflict:
     - Save a backup with `baseVersion: 100`.
     - Attempt concurrent save with `baseVersion: 50`.
     - Assert HTTP 409 response with error code `SYNC_CONFLICT` and active server payload.
  2. UTF-8 Byte Length Tracking:
     - Create budget payload containing multi-byte Unicode strings (e.g., `"Café ☕"`, `"José Ñuñez"`).
     - Assert stored `data_byte_length` in `user_backups` exactly matches `new TextEncoder().encode(payload).length`.
  3. Shrink Defense (<10%):
     - Seed a 100KB budget in `user_backups`.
     - Attempt to save a 5KB budget payload with `force: false`.
     - Assert HTTP 409 response with error code `SYNC_SUSPICIOUS`.
     - Repeat with `force: true` and assert HTTP 200 success.

#### 4. `tests/edge-cas-vault-retention.test.js`
- **Goal**: Validate BUG-003 remediation: 10-snapshot retention in `user_backup_versions`.
- **Test Scenarios**:
  1. 10-Snapshot Retention Bound:
     - Execute 12 consecutive manual sync requests (`{ manual: true }`) for user `usr_test_10`.
     - Query `user_backup_versions` where `user_id = 'usr_test_10'`.
     - Assert exactly 10 rows exist in the table (oldest 2 pruned, newest 10 preserved).
  2. Versions Endpoint Query Bound:
     - Invoke `GET /api/sync/versions`.
     - Assert returned `versions` array contains at most 10 items.
  3. Auto-Sync Non-Pollution:
     - Execute background auto-sync (`{ auto: true }`).
     - Assert `user_backup_versions` row count does not increase.
     - Assert `user_backups` active record updates successfully.

#### 5. `tests/edge-auth-invalidation.test.js`
- **Goal**: Validate FIN-AUDIT-002 and BUG-008: Cookie purging on 401/403 and `GATEWAY_KV` session caching.
- **Test Scenarios**:
  1. Immediate Credential Purging on 401:
     - Invoke `/api/auth/me` with an invalid or expired token.
     - Assert HTTP 401 status.
     - Assert `Set-Cookie` header contains `auth_token=; Max-Age=0; Path=/finance`, `Path=/api`, and `Path=/`.
  2. Token Version Revocation:
     - Issue token with `tv: 1`.
     - Increment `token_version` to 2 in D1 users table.
     - Invoke authenticated route.
     - Assert HTTP 401 `SESSION_EXPIRED` and cookie purge.
  3. Shared `GATEWAY_KV` Cache Precedence:
     - Populate session in `env.GATEWAY_KV`.
     - Verify `getCachedUser()` returns session from `GATEWAY_KV` without querying D1.
     - Verify `invalidateCachedUser()` purges key from `GATEWAY_KV`.

#### 6. `tests/edge-d1-parameterization.test.js`
- **Goal**: Validate FIN-AUDIT-001: Strict SQLite parameter binding across all database queries.
- **Test Scenarios**:
  1. Positional Parameter Inspection:
     - Wrap mock D1 `prepare()` to record all SQL strings passed during execution.
     - Assert all SQL strings use `?` placeholders and contain zero string concatenations or template literals.
  2. Compensating Rollback Verification:
     - Simulate a D1 failure during the final step of `handleSyncBackup`.
     - Verify compensating `DELETE FROM user_backup_versions WHERE id = ?` is executed.

---

### 4.4 Playwright Browser & E2E Suites (`finance/e2e/`)

#### 1. `e2e/ui-reachability.spec.js`
- **Goal**: Validate interactive SPA navigation and layout rendering.
- **Test Scenarios**:
  - Load `/finance/`.
  - Navigate between views: Dashboard -> Main Budget -> Ledger -> Amortization -> Settings.
  - Verify DOM elements, table headers, and numerical formatting render cleanly without console errors.

#### 2. `e2e/network-resilience.spec.js`
- **Goal**: Chaos test for offline network interruption and IndexedDB queue replay.
- **Test Scenarios**:
  - Mount application in authenticated state.
  - Intercept `/api/sync/backup` with `route.abort('failed')` to simulate offline mode.
  - User modifies a transaction in Ledger and a credit cell in Daily Matrix.
  - Inspect client IndexedDB via `page.evaluate()`:
    - Assert updated data is saved in `current_budget:${userId}`.
    - Assert pending mutation is enqueued in `cf_pending_sync:${userId}`.
  - Remove network intercept (`route.unroute()`).
  - Trigger manual or background sync.
  - Assert `cf_pending_sync:${userId}` is cleared and cloud backup returns HTTP 200.

#### 3. `e2e/importer-lifecycle.spec.js`
- **Goal**: Validate BUG-010: `SpreadsheetImporter.jsx` `finally {}` recovery on parser failure.
- **Test Scenarios**:
  - Open Spreadsheet Importer modal.
  - Upload a corrupt / malformed binary file that triggers an exception in parsing.
  - Assert error alert displays meaningful failure message.
  - Assert parsing spinner dismisses and UI returns to `STAGE.IDLE` (no permanent lock).

#### 4. `e2e/session-security.spec.js`
- **Goal**: Validate protected route defense and `techtrek:user-logout` window event broadcast.
- **Test Scenarios**:
  - Attempt accessing protected `/finance/ledger` without session cookies -> redirects to landing page.
  - Authenticate user -> views load.
  - Dispatch `window.dispatchEvent(new CustomEvent('techtrek:user-logout'))`.
  - Assert in-memory budget state is immediately cleared, all sensitive table cells unmount, and view redirects to landing.

---

## 5. Local Execution Guide

All commands must be executed using **PowerShell** from the `finance/` project directory:

### 5.1 Installing Test Dependencies
```powershell
cd e:\TechTrekGT\finance

# Install Vitest, Playwright, and coverage reporter
npm install -D vitest @vitest/coverage-v8 @playwright/test

# Install Playwright browser binaries
npx playwright install chromium
```

### 5.2 Executing Vitest Unit & Edge Integration Tests
```powershell
cd e:\TechTrekGT\finance

# Run all Vitest unit and edge integration tests
npx vitest run

# Run with test coverage report
npx vitest run --coverage

# Run specific financial math precision suite
npx vitest run tests/unit-financial-precision.test.js

# Run existing Node.js test runner suite alongside Vitest
npm test
```

### 5.3 Executing Playwright Chaos & Browser E2E Tests
```powershell
cd e:\TechTrekGT\finance

# Run all Playwright E2E suites (headless)
npx playwright test

# Run Playwright E2E suites with visible browser UI
npx playwright test --headed

# Run specific network resilience chaos test
npx playwright test e2e/network-resilience.spec.js

# View HTML test execution and trace report
npx playwright show-report
```

### 5.4 Unified Test Script Additions to `package.json`
```json
{
  "scripts": {
    "test:unit": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:e2e:playwright": "playwright test",
    "test:all": "npm run test && npm run test:unit && npm run test:e2e:playwright"
  }
}
```

---

## 6. Implementation Phasing & Milestones

1. **Phase 1: Toolchain Scaffolding**: Configure `vitest.config.js`, `playwright.config.js`, and package scripts.
2. **Phase 2: Core Helpers & Mocks**: Implement `tests/helpers/mockD1.js`, `mockKV.js`, and `hostilePayloads.js`.
3. **Phase 3: Unit & Edge Suites**: Implement `unit-financial-precision.test.js`, `edge-cas-concurrency.test.js`, `edge-cas-vault-retention.test.js`, `edge-auth-invalidation.test.js`, and `edge-d1-parameterization.test.js`.
4. **Phase 4: Playwright E2E Suites**: Implement `e2e/ui-reachability.spec.js`, `network-resilience.spec.js`, `importer-lifecycle.spec.js`, and `session-security.spec.js`.
5. **Phase 5: Full Suite Execution & Zero-Flake Validation**: Run the complete automated suite, verify 100% pass rate, zero test decay, and complete documentation synchronization.

---
*Plan created. Waiting for user review.*
