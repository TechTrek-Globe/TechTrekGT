# Phase 1 prompts: auth security hardening

Turn-by-turn prompts for the Antigravity agent. One prompt per turn, in order. Wait for the agent to finish and review its artifact before sending the next.

**Vocabulary:** there are two Phases in this project. Phase 1 is this file, the security hardening. Phase 2 is `PHASE-2-PROMPTS.md`, the correctness and data model work. Inside each Phase, the units of work are called Stages. Phase 1 has six Stages.

## Before you start

Put these in the workspace:

| File | Where it goes | What it is |
| --- | --- | --- |
| `AGENTS.md` | repo root | Persistent rules, read at the start of every session |
| `PHASE-1-PLAN.md` | anywhere in workspace | The full Phase 1 spec, Stages 1 through 6 |
| `SECURITY-FIXES.md` | anywhere in workspace | The authoritative findings list and fix rationale |
| `worker.js` | anywhere in workspace, **not** over your source | Reference hardened implementation |
| `migration-001-security-hardening.sql` | anywhere in workspace | The D1 migration |

Branch: `security/auth-hardening`. Do not work on `main`.

## Phase 1 stage map

| Stage | What it covers | Prompt |
| --- | --- | --- |
| 1 | Survey and plan | P1.1 |
| 2 | Migration | P1.2 |
| 3 | Backend integration | P1.2 |
| 4 | Email delivery | P1.3 |
| 5 | Front end | P1.3 |
| 6 | Verify | P1.4 |
| , | Close out | P1.5 |

---

## P1.1 Kickoff and survey

```
Read AGENTS.md, then read PHASE-1-PLAN.md in full and follow it. SECURITY-FIXES.md is the authoritative spec behind that plan; read it before you make any judgment call.

Execute Stage 1 only: survey the repository and produce an implementation plan artifact. Write no code and modify no files in this turn.

Critical context before you begin: worker.js is bundled output, not source. The functions named onRequestPost$6 through onRequestPost$1 are minified aliases for what are separate route modules in this repo. Map each one to the real source file it belongs in. Do not commit worker.js over real source under any circumstance.

Answer all five survey questions in Stage 1 with evidence from the actual repository, not assumptions.

End your plan with every conflict you found between the reference implementation and this repo's conventions. Then stop and wait for my review.
```

---

## P1.2 Migration and backend integration

Fill in the bracket before sending.

```
Plan approved with the following changes: [your edits here, or "none"].

Execute Stage 2 and Stage 3: the migration and the backend integration.

Apply the migration to the local D1 only. Do not run --remote. Do not run wrangler deploy. When the migration is ready for production, stop and hand me the exact command.

Port the logic into this repo's real module structure. The list of things that must be preserved exactly is in Stage 3 of the plan. Treat that list as non-negotiable; every item on it maps to a specific finding in SECURITY-FIXES.md.

Before you port the ALLOWED_ORIGINS list and the CSP connect-src hosts from worker.js, verify them against this repo's actual deployed domains and every external origin the real front end loads: fonts, analytics, widgets, image hosts. The reference lists came from a bundle and are probably incomplete. Show me the final lists and what you found.

Delete the dead code named in Stage 3, and remove ADMIN_EMAIL from wrangler.toml and from the secrets documentation.

Commit in logical units, one commit per stage.
```

---

## P1.3 Email delivery and front end

```
Execute Stage 4 and Stage 5: email delivery and the front end.

For Stage 4, if this project already has a mail provider, adapt sendResetEmail to it rather than adding Resend as a new dependency. Keep the contract identical: returns a boolean, never throws into the handler, and the handler returns the same generic response regardless of delivery outcome.

For Stage 5, before changing anything, grep the HTML and templates for inline event handler attributes (onclick, onsubmit, onload, onchange, and similar) and for javascript: URLs. The new CSP has no unsafe-inline in script-src, so every one of those will silently stop working. HTMLRewriter adds the nonce to script tags automatically, but it cannot fix inline attributes. List what you find, then refactor each to addEventListener.

Centralize the X-CSRF-Token header in the existing API client wrapper. Do not add it at individual call sites. If no wrapper exists, create one and route all API calls through it.

Handle the new 401 "Session expired. Please sign in again." by clearing local state and redirecting to login. It now fires whenever token_version advances, which includes a password reset on another device.
```

---

## P1.4 Verify

```
Execute Stage 6.

Write the twelve tests listed in the plan first. Where the pre-fix behavior is still observable, confirm the test fails against it before confirming it passes now. Then run the full existing suite and the build.

Then start wrangler dev and use the browser to walk these flows end to end, capturing a screenshot artifact for each: register with the name "José Ñuñez", log in, make an authenticated POST, log out, request a password reset, and complete the reset with the emailed code.

For the reset flow, if no mail provider is configured locally, read the code from the console.error output rather than adding a debug endpoint that returns it. Do not add any code path that puts a reset code in an HTTP response, even behind a dev-only flag.
```

---

## P1.5 Close out Phase 1

```
Produce the final Phase 1 summary artifact.

It must list: every file changed and why, the exact commands I need to run manually against production in the order I should run them, every secret or binding I must set before deploying, and anything you could not complete or had to work around.

Also answer the open decision at the end of PHASE-1-PLAN.md: confirm the security answer is implemented as a second factor on top of the emailed code, and tell me the exact file and line numbers to delete if I decide to drop security questions from the reset path entirely.

Then write the pull request description. Lead with what changes for users and what could break, then the technical summary, then the manual steps, then the rollback procedure. Plain language, no marketing tone, no em dashes.

Do not deploy. Do not run any remote migration.
```

---

## Utility prompts

Use these at any point during Phase 1.

**When it drifts outside the current stage**
```
Stop. You are outside the scope of the current stage.

Revert anything you changed that is not explicitly listed in that stage of PHASE-1-PLAN.md, then show me a diff of what remains and wait.
```

**When it proposes weakening a control**
```
No. That control exists because of a specific finding documented in SECURITY-FIXES.md.

Tell me which finding you believe no longer applies and why, and wait for my answer. Do not implement the change.
```

**Before you review a completed stage**
```
Before I review: show me the full diff for this stage, the test output, and a one-paragraph plain-language summary of the behavior that changed from a user's point of view.

Flag anything you implemented differently from the plan, and anything you were unsure about.
```

**When it wants to commit the bundle**
```
Stop. worker.js is build output. Check whether the file you are about to write contains $-suffixed function aliases or minified identifiers. If it does, you are about to overwrite real source with a bundle.

Show me the target path and the source path and wait.
```

---

## What comes next

When Phase 1 is merged, start a fresh session and run `PHASE-2-PROMPTS.md`. Phase 2 opens by fixing four regressions that Phase 1 introduces, so it genuinely depends on this work landing first.
