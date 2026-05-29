# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Session start (mandatory)

Every session begins with these steps in order:

1. Read `HANDOVER.md` — it is the authoritative pointer to current state and next action.
2. Run `git log --oneline -6` and `git status` — confirm the repo matches the handover.
3. Open `supporting/docs/ColonySimChecklist.md`, find the first unchecked step, read it before doing anything else.

The working rules (double-approval gate, test-first, design before code, no unprompted commits) are in `PROCEDURE.md`. Read it if any rule is unclear.

---

## Commands

```bash
# Full dev environment (server :3002 + Vite client :5173)
pnpm dev

# Server only / client only
pnpm server
pnpm client

# All tests (all workspaces)
pnpm test

# Server tests only — faster during engine development
pnpm --filter server test

# Watch mode for a specific workspace
pnpm --filter server test:watch

# Run a single test file
pnpm --filter server exec vitest run src/engine/production.test.ts

# Build for production
pnpm build
```

The server reads environment from `../.env` (relative to `server/`). Required vars:

```
MERIDIAN_DATA=/path/to/MeridianData   # directory containing Meridian parquet + manifest.db
COLONY_DB=/path/to/worldtamer.db       # SQLite colony database (created on first run)
PORT=3002                               # optional, default 3002
```

---

## Architecture

### Monorepo layout

```
packages/shared/    Shared TypeScript types (Colony, ColonyTurn, TurnResolution, EventEffects, …)
server/             Hono + node:sqlite API server, port 3002
client/             Vite + vanilla TypeScript browser client, port 5173
supporting/
  sql/              schema.sql (idempotent CREATE TABLE IF NOT EXISTS) + seed.sql (WTH ref data)
  docs/             Design, checklist, query guide, GA strategy
```

### Two databases, two query patterns

**Colony database (`node:sqlite`, synchronous):**
- Opened once at startup via `initColonyDb(path)` in `server/src/db/colony.ts`; path comes from env.
- All subsequent code calls `getDb()` — a module singleton. Tests pass `':memory:'`.
- Schema and seed are applied idempotently on startup. Additive column migrations are `ALTER TABLE … ADD COLUMN` wrapped in a `try/catch` at the bottom of `initColonyDb`.

**Meridian database (DuckDB, asynchronous):**
- Read-only star/planet parquet files. Never write to them.
- Queried only at colony founding to pull world parameters (orbit, axial tilt, atmosphere, etc.). Those values are then stored in `colonies` and never re-fetched.
- Query pattern: use the `manifest.db` SQLite file to find which sector parquet files to scan, then DuckDB queries those files directly. See `supporting/docs/MeridianQueryGuide.md` for the sector/manifest join pattern.
- `body_id` values are sector-local, not globally unique — always join on both `body_id` AND `system_id`.

### Server request → response path

```
routes/worlds.ts      GET /api/worlds             → meridian.ts (DuckDB)
routes/colonies.ts    POST /api/colonies           → founding.ts (pure) + colonies.ts (SQLite)
                      GET  /api/colonies/:id       → colonies.ts + infrastructure.ts (pure)
routes/turns.ts       POST …/turn/start            → rolls + events + production (pure) + SQLite
                      POST …/turn/allocate-rations → SQLite (updates active_turn_json)
                      POST …/turn/allocate-materials
                      POST …/turn/allocate-industrial
                      POST …/turn/finalize         → maintenance + infrastructure (pure) + SQLite
```

### Active turn state

A turn is a multi-step transaction. Between `turn/start` and `turn/finalize`, partial state is stored as JSON in `colonies.active_turn_json` (a `TurnResolution` object). Each allocation endpoint reads, mutates, and writes that JSON column. `turn/finalize` reads it, writes the completed `colony_turns` row, clears `active_turn_json`, and increments `colonies.current_month`.

### Engine layer (pure functions, no DB)

Everything in `server/src/engine/` is a pure function. No DB calls, no side effects. This is enforced by convention — if a function needs a reference table lookup, it either takes the data as a parameter or the lookup is done in the route layer and passed in.

| File | Responsibility |
|---|---|
| `production.ts` | Q_A, Q_M, Q_I, SN, SS, SL, power factor, seasonal φ(t) |
| `rolls.ts` | Output multiplier lookup, DM accumulation, weather/political outcome lookup |
| `events.ts` | Storm damage, random event effects, acclimatization advance |
| `maintenance.ts` | Maintenance cost schedule, infrastructure efficiency (60% road penalty) |
| `infrastructure.ts` | Road network status, transport capacity, transport demand |
| `founding.ts` | Weather factor, φ_min from axial tilt and tidal locking |

Each engine file has a co-located `.test.ts` file. Tests use hand-verified expected values from the WTH rules.

### Client

Three-panel layout: Colony Status (left) | Turn Resolution (right of centre) | Allocation (right). Hash-style router in `client/src/main.ts`: `WorldList → ColonyFounder → colony view`.

The colony view fetches from `GET /api/colonies/:id` which returns `{ colony, turn, recent_turns, active_events, road_status, transport_capacity, transport_demand }`. The allocation panel drives the sequential step endpoints and calls `refreshStatus()` after each submission.

### Reference data

All WTH lookup tables (`ref_agriculture_tl`, `ref_output_roll`, `ref_weather_table`, etc.) live in `supporting/sql/seed.sql` and are loaded into SQLite at startup. The engine functions that need them call `getDb()` at query time — they are not hardcoded except for `infrastructure.ts` (road costs by TL) and `maintenance.ts` (age-gated rate schedule).

### Test structure

- Math tests: one assertion per invariant, expected value hand-verified from WTH tables.
- HTTP tests: `buildApp()` called with `':memory:'` DB; real HTTP request/response cycle via `@hono/node-server` test client.
- No mocking of DB or engine functions in any test.
- 180 server tests, 0 client tests. `packages/shared` and `client` have `passWithNoTests: true` in their vitest configs.

---

## Design decisions (locked — do not re-litigate)

- **Port 3002.** 3001/3000 conflict with other local processes.
- **One colony per world.** `colonies.body_id` has a UNIQUE constraint.
- **Controlled economy only.** −1 DM always applied to all output rolls.
- **SN = rations_to_population / total_laborers.** SS = housing_m3 / total_laborers (raw m³). SL ratio = sl_value_per_person / sl_baseline (from home TL).
- **Sinusoidal growing season.** φ(t) from `orbit_au` and `axial_tilt_deg`; stored orbital params, not re-fetched.
- **Stars not in manifest.** Derive star file paths from body paths (`bodies/ → stars/` substitution).
- **Full turn history.** One `colony_turns` row per completed month; never mutated after write.
- **Capital transit lag deferred.** New capital is applied immediately, not after 12-month shipping delay.
