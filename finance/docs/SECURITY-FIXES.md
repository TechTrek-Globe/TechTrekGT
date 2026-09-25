# TechTrek Worker: security fixes

Every issue from the review is fixed in `worker.js`. 52 automated tests cover the behavior changes, all passing.

## Deploy order

1. Run `migration-001-security-hardening.sql` against D1.
2. Set the new secrets (below).
3. Deploy `worker.js`.
4. Update the front end for the four breaking changes at the bottom of this file.

## Required configuration

| Binding | Type | Notes |
| --- | --- | --- |
| `JWT_SECRET` | secret | Required. Also keys the reset-code HMAC, so rotating it invalidates outstanding reset codes. |
| `DB` | D1 | Required. |
| `RESEND_API_KEY` | secret | Required for password reset delivery. Without it, codes are generated and logged but never sent, and reset is effectively disabled. |
| `MAIL_FROM` | var | Verified sender address. |
| `SYNC_UNLOCK_CODE` | secret | Required. No fallback; the endpoint returns 503 when unset. |
| `RATE_LIMIT_KV` | KV | Fallback limiter. |
| `RATE_LIMITER` | Durable Object | Optional but recommended. Bind to the exported `RateLimiter` class for atomic counting. |
| `ADMIN_EMAIL` | — | **No longer used.** Remove it. |

```toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"

[[migrations]]
tag = "v1"
new_classes = ["RateLimiter"]
```

## What changed

### Critical

**C1, reset code returned to the caller.** `forgot-password` no longer returns `resetToken`. Codes are 8 digits, delivered by email through Resend, stored as an HMAC keyed on `JWT_SECRET` so a database leak yields no usable codes, single-use, 15 minute expiry, capped at 5 guesses per code and 5 codes per account per hour. Where the account has a security answer, the answer is required at reset time as a second factor, and a wrong code and a wrong answer return the same generic message.

**C2, PBKDF2 at 310,000 iterations.** Workers hard-caps PBKDF2 at 100,000 and throws `NotSupportedError` above it, which meant every hash operation was failing in production while logins against older records kept working, exactly the split-symptom pattern that makes this bug hard to spot.<cite>turn2search9</cite><cite>turn2search11</cite><cite>turn2search13</cite> Iterations are now 100,000, the cost stays stored in each record so verification always runs at the cost that produced the hash, and good logins transparently re-hash records at the current cost. A record with an unsupported cost fails closed instead of throwing.

**C3, admin by email claim.** `/api/admin/stats` now checks a `role` column on the authenticated user's database row. Registering the admin address grants nothing. `ADMIN_EMAIL` is gone.

**C4, hardcoded `"123456"`.** Removed. `SYNC_UNLOCK_CODE` is mandatory and the endpoint is rate limited at 5 per 5 minutes.

### High

**H5, `btoa` on non-Latin1 input.** All base64url encoding goes through UTF-8 bytes first. Registering as "José Ñuñez 🎉" now returns 201 instead of 500. Decoding validates the alphabet before touching `atob`.

**H6, rememberMe and session revocation.** Tokens carry a 2 hour `exp` plus an absolute session expiry `sexp` (2 hours, or 30 days with rememberMe). `/api/auth/me` slides the access token forward but never past `sexp`, and the cookie lifetime now matches the real session. Every token carries a `tv` claim checked against `users.token_version` on each authenticated request, so password resets, password changes, email changes, and logout all kill outstanding sessions immediately.

**H7, user enumeration.** `forgot-password` returns a byte-identical response whether or not the account exists. The unauthenticated `POST /api/auth/security-question` is removed; the question is now delivered in the reset email and exposed only to the authenticated owner via `GET /api/auth/security-question`. Login burns equivalent PBKDF2 CPU on unknown accounts so response timing does not distinguish the two cases. Duplicate registration returns a neutral message.

**H8, weak reset codes.** 8 digits from rejection-sampled `crypto.getRandomValues` (no modulo bias), hashed at rest, with both per-IP and per-account throttling and a per-code attempt cap.

**H9, rate limiter.** Uses a Durable Object when `RATE_LIMITER` is bound, which removes the read-then-write race entirely. The KV fallback now fails **closed** on error rather than waving the request through. A missing binding is logged loudly.

### Medium

- `Vary: Origin` added, and CORS headers are emitted only for allowlisted origins rather than defaulting to a blanket grant.
- CSP drops `script-src 'unsafe-inline'` in favor of a per-request nonce plus `strict-dynamic`, injected into `<script>` tags with HTMLRewriter; added `object-src 'none'` and `upgrade-insecure-requests`. Nonce-bearing HTML is `no-store`, because a cached nonce is a reused nonce.<cite>turn2search8</cite><cite>turn2search14</cite>
- No handler returns `err.message` any more. Internals are logged; clients get a generic string.
- CSRF double-submit cookie on all cookie-authenticated state-changing routes, plus an Origin check that rejects cross-site POSTs before they reach a handler. Cookies are uniformly `SameSite=Strict`.
- Request bodies capped at 64 KB for auth routes and 2 MB for sync, checked on both `Content-Length` and actual bytes.
- All queries select explicit columns; no more `SELECT *`.
- The silent `catch (e) {}` in `/api/auth/me` is gone; user data now comes from the database with no stale-claim fallback.
- Email changes and security-question changes require the current password.
- JWT verification rejects `alg` confusion and `alg: none`.
- Admin listing is bounded at 1,000 rows.

## Breaking changes for the front end

1. **CSRF header.** Every cookie-authenticated POST must send `X-CSRF-Token`. The value comes back as `csrfToken` in the login, register, me, and update-profile responses, and is also readable from the non-HttpOnly `csrf_token` cookie.
2. **Password reset is now two-channel.** The reset screen can no longer display the code. It must tell the user to check their email, then collect the code plus the security answer. `POST /api/auth/reset-password` accepts `{ email, token, newPassword, securityAnswer }`.
3. **`POST /api/auth/security-question` is gone.** Use `GET /api/auth/security-question` for the signed-in user's own question. The reset flow gets the question from the email instead.
4. **Reset codes are 8 digits, not 6.** Update any input mask or validation.

One judgment call worth flagging: I made the security answer a second factor *on top of* the emailed code rather than an alternative to it. The original design let the answer alone authorize a reset, and security answers are low-entropy and frequently public. If you would rather drop security questions from the reset path entirely, delete the `answerMatches` block in `handleResetPassword` and email possession becomes the sole factor, which is the more common modern design.
