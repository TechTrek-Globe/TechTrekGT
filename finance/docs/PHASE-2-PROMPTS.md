# Phase 2 prompts: correctness, data model, and reliability

Turn-by-turn prompts for the Antigravity agent. One prompt per turn, in order. Wait for the agent to finish and review its artifact before sending the next.

**Run this only after Phase 1 is merged.** Start a fresh session. Phase 2 opens by fixing four regressions that Phase 1 introduces, so it depends on that work having landed.

**Vocabulary:** Phase 1 is `PHASE-1-PROMPTS.md`, the security hardening. Phase 2 is this file. Inside each Phase, the units of work are called Stages. Phase 2 has ten Stages, numbered 0 through 9.

Nothing in Phase 2 is a security finding. These are correctness bugs, data-loss risks, dead infrastructure, and contract problems found in a follow-up review of the application flow.

## Before you start

| File | Where it goes | What it is |
| --- | --- | --- |
| `AGENTS.md` | repo root | Persistent rules, still in force |
| `PHASE-2-PLAN.md` | anywhere in workspace | The full Phase 2 spec, Stages 0 through 9 |
| `SECURITY-FIXES.md` | anywhere in workspace | Still needed; Stage 6 must not undo its information-hiding rules |

Branch: `fix/flow-correctness`.

## Phase 2 stage map

| Stage | What it covers | Prompt | Gate |
| --- | --- | --- | --- |
| 0 | Survey and plan | P2.0 | yes |
| 1 | Regressions from Phase 1 | P2.1 | |
| 2 | Sync data loss | P2.2 | |
| 3 | Household model decision | P2.3, P2.4 | yes |
| 4 | Schema and data integrity | P2.5 | |
| 5 | Email verification | P2.6 | |
| 6 | API error contract | P2.7 | |
| 7 and 8 | Routing, rate limit shape | P2.8 | |
| 9 | Observability and close out | P2.9 | |

Stages 1 and 2 are independent of the Stage 3 decision. Ship them as their own PR. Do not hold the data-loss fix behind the data-model debate.

---

## P2.0 Kickoff and survey

```
Read AGENTS.md, then read PHASE-2-PLAN.md in full.

Execute Stage 0 only. Write no code and modify no files in this turn.

Answer all six survey questions with evidence from the actual repository and the actual schema, not assumptions. For question 4 I need real row counts; if you cannot query production, tell me the exact read-only command to run and I will paste the output back.

Question 3 matters most: search exhaustively for any reader of people, households, or household_members, including dead components, commented-out code, and anything in the client bundle. If you find nothing, say so plainly rather than hedging.

End your plan with every conflict you found between the brief and what is actually in this repo.
```

---

## P2.1 Stage 1, regressions from Phase 1

```
Survey approved. Execute Stage 1 only.

All four items are specified precisely in the plan. Implement them as written. To be clear on what these are: they came from the Phase 1 hardening pass, not from the original code, so fixing them first gives this branch a clean base.

For 1.4, use the polling interval you found in Stage 0 to make your recommendation. If the client does not poll /api/auth/me, skip the KV cache entirely and document the per-request D1 read as accepted cost. Do not add caching complexity the traffic pattern does not justify. If you do add the cache, every code path that increments token_version must write through, or session revocation stops being immediate and that is a security regression.

Write a test for each of the four. For 1.3 specifically, the test must prove that two concurrent /me calls do not produce two different tokens.

Commit when the suite is green, then stop.
```

---

## P2.2 Stage 2, stop losing user data

```
Execute Stage 2. This is the highest-severity item in the brief. Take your time.

Implement 2.1 through 2.4 as written. Two requirements I want to be explicit about:

A missing baseVersion must never silently mean "overwrite." It requires force: true, set deliberately by the client.

The 409 response must include serverData so the client can offer a real choice without a second round trip.

Write these tests before the implementation:
- a push with a stale baseVersion returns 409 and leaves the stored row untouched
- a push with a current baseVersion succeeds
- a push with no baseVersion and no force flag is rejected
- restoring a prior version returns exactly the payload that was stored
- the version table prunes to 10 and prunes the oldest first
- a 500-byte payload against a 50 KB stored backup is rejected as suspicious
- the same payload with force: true is accepted

Then build the client side of the 409: a "this budget changed on another device" prompt offering keep local or keep server. Do not auto-resolve, and do not merge silently.

Note that the new version-history endpoints are authenticated and must be scoped to the calling user. A user must never be able to list or restore another user's versions. Write a test proving that.
```

---

## P2.3 Stage 3 gate, the household decision

This turn produces analysis only. You answer, then send P2.4.

```
Execute Stage 3, the analysis only. Write no code.

Produce the two costed options, A and B, in a decision artifact. For each I need: every file touched, the migration steps given the real row counts from Stage 0, what breaks for existing users, and a rough effort estimate.

Be direct about the tradeoff. Do not hedge or present them as equally good. Tell me which you would pick and why, then let me decide.

One thing to confirm while you are in there: verify that user_backups is keyed on userId and not householdId, and state plainly what happens today if two users end up in the same household.
```

---

## P2.4 Stage 3 implementation

Delete the branch that does not apply before sending.

```
I have chosen Option [A or B]. Implement it.

[If A] Re-key user_backups on household_id with a migration that maps every existing row through household_members. Any user with no household row needs one created during the migration, not skipped. Add the invite, accept, list-members, and remove-member endpoints. Every one of them must authorize against the caller's own household; a user must never be able to read or modify another household by passing its id. Write an explicit test proving cross-household access returns 403.

[If B] Drop households, household_members, and people. Remove householdId from the JWT payload, from every response body, and from the client. Simplify registration to a single insert. Confirm nothing in the client reads householdId before you remove it. Keep the migration reversible: back the tables up into a scratch table rather than dropping outright.
```

---

## P2.5 Stage 4, schema and data integrity

```
Execute Stage 4.

For 4.1, write created_at and status explicitly at registration, and backfill created_at for existing rows. If no signal exists for the real creation time of old rows, use a fixed sentinel and record in the migration comment exactly what that sentinel means, so nobody later mistakes it for real data.

For status, recommend one of the two options before implementing: make it a real settable value with an admin endpoint, or remove it from the query and the UI. Do not leave a column that can only ever display "Active."

Skip 4.3 entirely if the Stage 3 decision was Option B, since the people table no longer exists.

For 4.4, migrate user_backups.updated_at to epoch milliseconds as INTEGER. The conversion to ISO-8601 happens only at the API boundary. Verify no client parses the raw stored format before you change it.
```

---

## P2.6 Stage 5, email verification

```
Execute Stage 5.

Reuse the exact token pattern already in the reset code path from Phase 1: crypto.getRandomValues, HMAC with JWT_SECRET before storage, single use, expiry checked server side. Do not invent a second scheme.

Unverified users can still use the app. A banner, not a hard block. A mail delivery hiccup must not become a support ticket.

For email changes: the new address goes to pending_email and does not take effect until confirmed. The old address stays active throughout and receives a notification that a change was requested. That notification is the user's only warning if someone else is changing their address, so do not skip it.

For 5.1, the fix is in the UI only. The server response stays generic, because changing it would reintroduce the account enumeration that Phase 1 closed. Add a visible countdown on the resend button so the cooldown is apparent before it is hit rather than invisible after.
```

---

## P2.7 Stage 6, API error contract

```
Execute Stage 6.

Change the fail() signature to take the code as its first argument so a call site physically cannot omit it. Update every call site.

Then audit the enum against the information-hiding rules from Phase 1. A bad reset code and a bad security answer must both return RESET_CODE_INVALID. An unknown email and a wrong password must both return INVALID_CREDENTIALS. If any code you added lets a client distinguish two cases that the generic strings were deliberately merging, collapse it. This is the one stage in Phase 2 that can silently undo a Phase 1 fix, so check it carefully.

Export the enum in a shared module the client imports. Then find every client branch that string-matches an error message and rewrite it against the code. List any you could not convert.
```

---

## P2.8 Stages 7 and 8, routing and rate limit shape

```
Execute Stage 7 and Stage 8.

For 7.2, tell me which SPA mount you recommend as canonical before you 301 the other, and confirm whether the build emits absolute or relative asset paths. Getting this wrong breaks every asset at one of the two mounts.

For 7.5, check whether anything in the Cloudflare dashboard config already handles HTTP to HTTPS before you remove the Worker-side redirect. If you cannot check, leave the protocol check in place and only remove the client-controllable x-forwarded-proto condition.

For 8.3, first determine empirically whether CF-Connecting-IP is ever actually absent in production. If it is not, fail the request outright instead of building a fallback keying scheme for a case that never happens.
```

---

## P2.9 Stage 9 and close out Phase 2

```
Execute Stage 9, then produce the final Phase 2 summary.

For 9.3, emit the counters listed in the brief. Keep cardinality low: no user ids, no email addresses, no payload contents as dimensions.

For 9.2, the requestId goes into every console.error for that request and into error response bodies. Confirm it does not appear in successful responses.

The final summary artifact must list: everything that changed across all stages, every manual step I must run against production in order, every new binding or secret, and everything deferred or skipped with the reason.

Then run the full suite, the build, and a browser walkthrough of register, verify email, login, a sync conflict, and a password reset. Capture screenshots for each.

Then write the pull request description. Lead with what changes for users and what could break, then the technical summary, then the manual steps, then the rollback procedure. Plain language, no marketing tone, no em dashes.
```

---

## Utility prompts

**When it drifts outside the current stage**
```
Stop. You are outside the scope of the current stage.

Revert anything you changed that is not explicitly listed in that stage of PHASE-2-PLAN.md, then show me a diff of what remains and wait.
```

**When it proposes weakening a Phase 1 control**
```
No. That control came from Phase 1 and exists because of a specific finding in SECURITY-FIXES.md.

Tell me which finding you believe no longer applies and why, and wait for my answer. Do not implement the change.
```

**Before you review a completed stage**
```
Before I review: show me the full diff for this stage, the test output, and a one-paragraph plain-language summary of the behavior that changed from a user's point of view.

Flag anything you implemented differently from the plan, and anything you were unsure about.
```

**If you decide to stop early**
```
Stop here. Stages [N] through 9 are deferred.

Produce the summary artifact covering only what was completed, and write a short handoff note listing the deferred stages, why each still matters, and what state the branch is in.
```

---

## A reasonable place to stop

Stages 1 and 2 are the ones that matter most. Stage 2 prevents silent destruction of a user's budget, which is the failure mode people do not forgive in a finance app. If you want to ship and pause, merging after P2.2 is defensible. Stages 5 through 9 are real improvements but lower severity.
