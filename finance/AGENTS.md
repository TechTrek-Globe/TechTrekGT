# AGENTS.md

Persistent rules for AI agents working in this repository. Place at the workspace root (Antigravity reads it at session start, alongside `~/.gemini/GEMINI.md`). Keep under 12,000 characters.

## Stack

Cloudflare Workers (or Pages Functions) on the edge runtime, D1 for persistence, KV and optionally Durable Objects for rate limiting, static SPA assets served through the `ASSETS` binding. There is no Node.js runtime: no `require`, no `Buffer`, no `crypto` module, no filesystem. Only Web Crypto, `fetch`, `Request`/`Response`, and `HTMLRewriter`.

## Edge runtime constraints that bite

- **PBKDF2 is capped at 100,000 iterations.** Above that the runtime throws `NotSupportedError`. Never raise `PBKDF2_ITERATIONS` past this without verifying against the live runtime. This caused a production outage in this repo.
- **`btoa` only accepts Latin-1.** Always encode to UTF-8 bytes before base64. Any user-supplied string reaching `btoa` directly is a bug.
- **KV is eventually consistent.** Never use it for anything requiring atomicity or a correctness guarantee. Read-then-write against KV is a race.
- **Subrequest and CPU limits apply.** Do not add loops that fan out `fetch` calls per record.

## Security rules, non-negotiable

These encode fixes for real vulnerabilities that were found in this codebase. Do not undo them.

1. **Never return a credential, reset code, token, or OTP in an HTTP response body.** Secrets that authenticate a user go out of band only, over email. A reset endpoint returns the same generic body whether or not delivery succeeded.
2. **Never reveal whether an account exists** on an unauthenticated endpoint. Forgot-password, security-question lookup, and login must return identical responses and comparable timing for known and unknown addresses. Burn equivalent CPU on the unknown path.
3. **Authorization comes from the database, never from a JWT claim.** Check a `role` column on the user's row. Do not gate admin access on an email claim, a header, or an environment-variable comparison.
4. **Fail closed.** If a binding is missing, a secret is unset, a rate limiter errors, or a hash has an unsupported cost, deny the request. There are no default passcodes and no `||` fallbacks on secret values.
5. **Never leak internal error text to clients.** `console.error` the real message; return a fixed generic string. This includes the top-level router catch.
6. **Every authenticated request validates `token_version`** against the user's database row. This is what makes password resets and logouts actually revoke sessions.
7. **Every cookie-authenticated non-GET request requires a CSRF token** (double-submit cookie plus `X-CSRF-Token`). Bearer-authenticated requests are exempt.
8. **Store secrets hashed.** Password reset codes are HMAC'd with `JWT_SECRET` before they touch the database. Passwords and security answers go through PBKDF2 with a per-record salt and stored cost.
9. **Randomness for security values comes from `crypto.getRandomValues` with rejection sampling.** `Math.random` is banned. Modulo on a raw 32-bit value is biased and also banned.
10. **Compare secrets in constant time.** Use the SHA-256-then-XOR helper. No `===` on tokens, codes, or hashes.
11. **No `unsafe-inline` in `script-src`.** The CSP uses a per-request nonce injected via HTMLRewriter. Nonce-bearing HTML must be `no-store`. Do not add inline event handlers to the markup.
12. **CORS is allowlist-only, and `Vary: Origin` is mandatory** wherever a CORS header is set.
13. **Cap every request body.** 64 KB for auth routes, 2 MB for sync. Check both `Content-Length` and actual byte length.
14. **All SQL uses bound parameters.** No template interpolation into a query string, ever. Select explicit columns; `SELECT *` is not allowed on tables holding password hashes.

## Conventions

- Handlers return via the `json()` / `fail()` helpers so every response carries consistent headers.
- Validate and normalize input at the top of a handler: trim, lowercase emails, enforce max lengths, reject non-strings. Use `asTrimmedString`.
- Routing is a flat `METHOD /path` lookup table, not an `if/else` chain.
- Authentication goes through the single `authenticate()` helper. Do not re-implement token parsing in a handler.
- Cookies: `HttpOnly` on `auth_token`, `Secure`, `SameSite=Strict`, `Path=/` on both cookies, uniformly. Do not mix `Lax` and `Strict` across endpoints.
- Log with a bracketed route tag: `console.error("[login] ...")`.
- Comments explain *why*, especially for security decisions. A future agent must not "simplify" a constant-time comparison or a fail-closed branch because it looks redundant.

## Testing

- Every security control gets a test that asserts the *failure* path, not just the happy path.
- When fixing a vulnerability, write the test that would have caught it before writing the fix.
- Tests run against a fake D1 that mirrors the real query shapes. Do not test against production data.
- Run the full suite and the build before declaring a task done.

## Git and safety

- Never run `wrangler deploy`, `wrangler d1 execute --remote`, or anything that writes to production. Prepare the command and hand it back.
- Never commit, echo, or log a secret value. Confirm bindings by name only.
- Never commit bundled or minified output over real source files. If a file contains `$1`-suffixed function aliases, it is a build artifact.
- Work on a feature branch. Commit in logical units with clear messages.
- Schema changes go in a numbered migration file, never as an ad-hoc statement.

## Required bindings

`JWT_SECRET`, `DB` (D1), `SYNC_UNLOCK_CODE`, `RESEND_API_KEY`, `MAIL_FROM`, `RATE_LIMIT_KV`, and optionally `RATE_LIMITER` (Durable Object, preferred over KV). `ADMIN_EMAIL` is deprecated and must not be reintroduced as an authorization mechanism.

## When in doubt

If a requested change would weaken any rule above, stop and ask rather than implementing it. Flag the conflict explicitly. A refused unsafe change is a better outcome than a silently weakened control.
