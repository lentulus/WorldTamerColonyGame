# WorldTamer — Working Procedure

This document defines the rules that govern how Claude and the user collaborate on this project. It is non-negotiable and applies to every session.

---

## Session start

Every new session begins with the same three steps, in order:

1. Read the handover document (when one exists) — it is a pointer to current state and next action.
2. Run `git log --oneline -10` and `git status` — confirm the repo is where the handover says it is.
3. Open the active checklist, find the first unchecked step, and read it before doing anything else.

---

## Double-approval gate

Any action that is hard to reverse requires two explicit approvals before Claude acts.

**Gate sequence:**
1. User gives first approval ("yes", "go ahead", or equivalent).
2. Claude echoes the *specific* action it is about to take — not a category, the exact command or change.
3. User gives a second explicit confirmation.
4. Only then does Claude act.

**Actions that always require the gate:**

- Installing or removing packages (`pnpm add`, `pnpm remove`)
- All `git commit` and `git push` operations
- Any destructive database operation (DROP, DELETE without WHERE, migration rollback)
- Structural refactors that touch more than one module boundary

**No unprompted commits.** Claude never commits without pre-commit triage and a completed double-approval gate.

---

## Test-first development

No production code is written until a failing test exists that the code is meant to make pass.

- Write the test. Confirm it is red (failing). Then write the minimum code to make it green.
- **Math tests are Claude's responsibility.** When a computation has an analytic result — a formula, a derivation rule, a physical conversion — Claude identifies the invariant, extracts it as a pure function, and writes a test against a hand-verified expected value before implementing the derivation in production code.

---

## Design before code

Architecture decisions are pinned before implementation begins.

- Surface the decision explicitly as a named choice with at least two options and a recommendation.
- Reach explicit agreement with the user before writing any code that depends on the decision.
- Once agreed, record the decision and its reason in the relevant design document.
- Do not re-litigate decisions that are already recorded. If a decision needs to change, raise it explicitly and update the document.

---

## Durable artifacts

Conversation continuity is fragile. The chat history cannot be relied on across sessions.

- Any decision, agreed scope, or architectural constraint that matters beyond the current conversation must be written into a document or the handover file — not left in chat.
- The handover document is the authoritative pointer to current state. It is updated at the end of every working session before the session closes.
- Design documents hold the *why* behind decisions, not just the *what*.

---

## Language conventions

Write methodology terms in plain English, not acronyms or framework jargon.

| Write this | Not this |
|---|---|
| highest-priority defect | P0 |
| minimum viable product | MVP |
| definition of done | DoD |
| slice / stage | sprint |

The same rule applies to all project process language: severity levels, delivery stages, quality gates — write them out.

---

## Unit conventions (GURPS source material)

Apply blunt rounded conversions. Do not carry unnecessary precision.

| Source | Use |
|---|---|
| 1 pound | 0.5 kg |
| 1 yard | 1 metre |
| 1 atm | 1 bar |
| 1 mile per second (delta-V) | 1.6 km/s |

Temperature: use kelvin for planetary and astronomical contexts; use Celsius for human-scale contexts (habitability, biology, comfort). Round to the nearest even degree Celsius unless precision is required for a calculation.

Never quote pedantic conversion factors in documentation, comments, or schema notes. Treat the values as if they were written in sensible units originally.

---

## Notation conventions

- TL^ (superscience) is not a schema exception. Each ^ capability is assigned a hard numeric tech level, qualified by faction. Treat hard TL assignments as canonical.
- Use metres, kilograms, and bar throughout. Drop centimetres and grams.
