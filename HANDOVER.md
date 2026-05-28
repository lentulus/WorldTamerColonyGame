# WorldTamer — Handover

Updated 2026-05-28. If the session closes mid-task, read this file first.
It is a pointer document — it tells you what has been built, what is next,
and where to find the authoritative details.

---

## TL;DR for a fresh session

**Slices 0–2 complete. Next action: begin Slice 3 (turn resolution — dice rolls, weather, political events).**

First actions in a new session:
1. Read this file.
2. `git log --oneline -6` and `git status` — confirm current state.
3. Open [ColonySimChecklist.md](supporting/docs/ColonySimChecklist.md) and find the first unchecked step (currently **3.1**).
4. Read [ColonySimDesign.md](supporting/docs/ColonySimDesign.md) for architecture decisions before writing any code.
5. Apply the double-approval gate before doing anything irreversible.

---

## What the project is

A single-user desktop web app for running a colony economy simulation
based on *World Tamer's Handbook* (TNE 0311, GDW 1994), pure WTH rules only.
The player governs a colony through monthly turns: roll dice, resolve events,
allocate output, repeat.

Stack: TypeScript throughout. Server is Hono + `@hono/node-server` (port 3002).
Client is Vite + vanilla TypeScript, no framework. Shared types in
`packages/shared`. Colony state in `node:sqlite` SQLite. Star/planet data
from Meridian DuckDB parquet (read-only). pnpm workspaces.

The design authority is [ColonySimDesign.md](supporting/docs/ColonySimDesign.md).
Working procedure (double-approval gate, test-first, etc.) is [PROCEDURE.md](PROCEDURE.md).

---

## What to read, in order

1. This file — orientation.
2. [ColonySimChecklist.md](supporting/docs/ColonySimChecklist.md) — running execution record; find the first unchecked step.
3. [ColonySimDesign.md](supporting/docs/ColonySimDesign.md) — scope, decisions, data model, UI layout.
4. [MeridianQueryGuide.md](supporting/docs/MeridianQueryGuide.md) — how to read Meridian parquet data using the manifest. Critical for any Meridian query work.
5. `PROCEDURE.md` — working rules (double-approval gate, test-first, plain English).

---

## Architecture decisions (do not re-litigate)

- **Port 3002.** 3001 conflicts with another running process; ports will eventually merge.
- **One colony per world.** `colonies.body_id` has a UNIQUE constraint. Multi-colony UI deferred.
- **Full turn history.** One `colony_turns` row per completed month — essential for referee use.
- **Controlled economy only.** −1 DM always applied to all output rolls. Free-market deferred.
- **Armed forces: AFL headcount only.** No weapons, vehicles, or readiness mechanics yet.
- **Sinusoidal growing season.** φ(t) derived from `orbit_au` and `axial_tilt_deg`.
- **Abstract land tracking.** Total km² per use category; no hex map.
- **Meridian is read-only, queried via manifest.** Never write to parquet or manifest.db. See MeridianQueryGuide.md for the sector/manifest query pattern.
- **Stars not in manifest.** Derive star file paths from bodies paths (`bodies/ → stars/` substitution).
- **SN = rations / total_laborers.** SS = housing_m3 / total_laborers (raw m³, not normalised). SL = 1.0 at founding.

---

## Current repo state

```
WorldTamer/
├── packages/shared/src/types.ts     All API types: Colony, ColonyTurn, WorldCandidate,
│                                    FoundColonyRequest, WorldListParams, allocation types
├── server/src/
│   ├── app.ts                       Hono app — routes only; DB init is caller's responsibility
│   ├── main.ts                      Startup: initColonyDb() then buildApp() on port 3002
│   ├── config.ts                    MERIDIAN_DATA, COLONY_DB, PORT from .env
│   ├── db/
│   │   ├── colony.ts                SQLite init (schema.sql + seed.sql on first run)
│   │   ├── colonies.ts              CRUD: createColony(), getColony(), getSlBaseline()
│   │   └── meridian.ts              DuckDB: getHabitableWorlds(), getWorldById()
│   ├── engine/
│   │   └── founding.ts              Pure: computeWeatherFactor(), computePhiMin()
│   └── routes/
│       ├── worlds.ts                GET /api/worlds
│       └── colonies.ts              POST /api/colonies, GET /api/colonies/:id
├── client/src/
│   ├── main.ts                      Hash-style router: WorldList → ColonyFounder → colony view
│   ├── api/
│   │   ├── worlds.ts                fetchWorlds()
│   │   └── colonies.ts              foundColony(), fetchColony()
│   ├── views/
│   │   ├── WorldList.ts             Filterable world table (distance + habitability filters)
│   │   ├── ColonyFounder.ts         Founding form
│   │   └── ColonyStatus.ts          Left-panel status display (all colony state, SN/SS/SL coloured)
│   └── style.css                    Global CSS (dark theme)
└── supporting/
    ├── docs/
    │   ├── ColonySimDesign.md       Design decisions (all locked)
    │   ├── ColonySimChecklist.md    Execution record
    │   └── MeridianQueryGuide.md    How to use the manifest for sector-scoped queries
    └── sql/
        ├── schema.sql               SQLite schema (CREATE TABLE IF NOT EXISTS — idempotent)
        └── seed.sql                 WTH reference data (all ref_* tables, TL 0–15)
```

**Test count: 37 green** (15 math + 11 Meridian + 9 HTTP colonies + 2 HTTP worlds).
`pnpm test` from root runs all workspaces.

---

## Known gaps / deferred items

| ID | What | Where deferred |
|---|---|---|
| Slice 3 | Turn resolution (dice, weather, political) | Next |
| Slice 4 | Rations + materials allocation, SN | Not started |
| Slice 5 | Industrial allocation, SS/SL, political track | Not started |
| Slice 6 | Labor reassignment, capital, maintenance, finalization | Not started |
| Slice 7 | Weather damage, random events, acclimatization | Not started |
| Slice 8 | Infrastructure (roads, transport) | Not started |
| Slice 9 | Smoke test + sign-off | Not started |
| Later | Off-world trade (step 8 of monthly turn) | Deferred |
| Later | Armed forces weapons/vehicles/readiness | Deferred |
| Later | Free-market economy mode | Deferred (needs allocation AI) |
| Later | Multi-colony UI | Data model supports it; UI deferred |
| Later | Hex map land tracking | Reserved for mapping project integration |
| Later | Capital transit lag (12-month shipping) | Currently applied immediately |

---

## Sequencing — what to build next

| Slice | Goal | Status |
|---|---|---|
| 0 | Scaffold, schema, reference data | **Done** `690d54e` |
| 1 | World selection from Meridian | **Done** `e313c9a` |
| 2 | Colony founding, turn 0 snapshot | **Done** `c324558` |
| **3** | **Turn resolution: dice, weather, political events, output rolls** | **Next** |
| 4 | Rations + raw materials allocation, SN | Not started |
| 5 | Industrial allocation, SS/SL, political track | Not started |
| 6 | Labor reassignment, capital, maintenance, finalization | Not started |
| 7 | Weather damage, random events, acclimatization | Not started |
| 8 | Infrastructure | Not started |
| 9 | Smoke test + sign-off | Not started |

**First step of Slice 3 is 3.1** — write red math tests for `lookupOutputMultiplier()`,
`applyOutputDMs()`, `lookupWeatherOutcome()`, and `lookupPoliticalOutcome()`.

---

## Working-style rules (non-negotiable)

- **Double-approval gate on every `[HUMAN]` step:**
  1. User gives first approval.
  2. Claude echoes the specific next action.
  3. User gives second explicit confirmation.
  4. Only then Claude acts.
  Applies to: `pnpm add`, `git commit`, `git push`, destructive DB ops,
  structural refactors.

- **No unprompted commits.** Always pre-commit triage + double-approval.

- **Test-first.** No production code without a failing red test first.
  Math tests are Claude's responsibility.

- **Design pinned before code.** Surface decisions explicitly; reach
  agreement before implementing.

---

## Working-style preferences (durable)

- No web-programming background — explain HTTP, routing, JS ecosystem
  from first principles when relevant.
- Plain English for methodology terms — no acronyms (no P0, MVP, DoD, etc.).
- Durable artifacts over chat history. Write decisions into documents.
- GURPS unit conventions: 1 lb = 0.5 kg, 1 yd = 1 m, 1 atm = 1 bar,
  1 mps (delta-V) = 1.6 km/s. Kelvin for astronomical, Celsius for human scale.
