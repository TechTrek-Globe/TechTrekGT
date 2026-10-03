# Finance OS - Features & API Specification

## 1. Feature Suite

Finance OS is the personal budget tracking and financial projection application in TechTrekGT:

- **Daily Matrix & Cash Flow Forecasting:** 365-day running balances, paycheck allocations, split earner credits, and overdraft prevention.
- **Ledger Import & Reconciliation:** Dedicated Web Worker (`spreadsheet.worker.js`) offloads heavy SheetJS (`xlsx`) file parsing off the main browser thread to prevent UI freezing.
- **Budget Metadata Management:** Multi-account checking/savings management, bill scheduling with variable/fixed frequencies, funding goals, and amortized loan tracking.
- **Cloud Vault & Multi-Version Backup:** Optimistic concurrency sync against Cloudflare D1 with up to 10 historical rollback snapshots.
- **SSO Authentication & Session Management:** WebCrypto HS256 JWT sessions, PBKDF2-SHA256 password hashing (600,000 iterations), double-submit CSRF protection, and HttpOnly `SameSite=Strict` cookies.

## 2. Serverless API Routes

All serverless API routes execute in Cloudflare Workers ESM format (`src/worker.js` and `functions/api/*`):

| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/sync/backup` | POST | Yes (CSRF) | CAS cloud backup save with schema validation and version snapshots |
| `/api/sync/restore` | GET | Yes | Retrieves current user backup with conditional 304 ETag support |
| `/api/sync/versions` | GET | Yes | Lists up to 10 stored backup versions for the user |
| `/api/sync/restore-version` | POST | Yes (CSRF) | Restores a specific historical backup version |
| `/api/verify-sync-code` | POST | Yes (CSRF) | Constant-time validation of cloud vault passcode |
| `/api/auth/register` | POST | No | User registration with Turnstile verification and compensating rollback |
| `/api/auth/login` | POST | No | User login with Turnstile verification and transparent password rehashing |
| `/api/auth/me` | GET | Yes | Restores user session state without cookie clobbering |
| `/api/auth/refresh` | POST | Yes (CSRF) | Renews access tokens within the existing session expiration window |
| `/api/auth/logout` | POST | No | Revokes sessions by bumping `token_version` and clearing cookies |
| `/api/auth/forgot-password` | POST | No | Sends one-time password reset code via email |
| `/api/auth/reset-password` | POST | No | Atomic multi-statement password update and token version revocation |
| `/api/auth/verify-email` | POST | Yes (CSRF) | Verifies email address via 8-digit OTP |
| `/api/auth/resend-verification`| POST | Yes (CSRF) | Resends email verification code |
| `/api/auth/update-profile` | POST | Yes (CSRF) | Updates profile and handles email change requests with compensating rollback |
| `/api/auth/confirm-email-change`| POST | Yes (CSRF) | Confirms pending email change with OTP |
| `/api/auth/security-question` | GET | Yes | Authenticated retrieval of security question |
| `/api/admin/stats` | GET | Yes (Admin) | Administrative statistics query with pagination ceilings |
| `/api/admin/user-status` | POST | Yes (Admin) | Updates user active/suspended status with session revocation |

## 3. Data Integrity & SQL Parameterization (FIN-AUDIT-001)

- **Strict SQLite Parameterization:** All queries use `db.prepare(sql).bind(...)` with `?` positional parameters. No template literal variable interpolations exist in any API route or utility.
- **Compensating Rollbacks:** In multi-step database mutations, catch blocks surgically execute compensating D1 statements to delete incomplete, orphaned, or unlinked records on downstream failure.
